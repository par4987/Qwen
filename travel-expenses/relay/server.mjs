#!/usr/bin/env node
/**
 * Mochila Relay — servidor de retransmisión "ciego" para grupos compartidos.
 *
 * No puede leer nada: sólo almacena, por grupo y dispositivo, un blob cifrado de extremo a extremo
 * (AES-256-GCM, la clave nunca sale de los móviles). Para leer o escribir hay que presentar un token
 * derivado del secreto del grupo; el servidor sólo guarda el SHA-256 de ese token.
 *
 * Sin dependencias: Node >= 20.
 *
 * Variables de entorno:
 *   PORT                 (8787)
 *   HOST                 (0.0.0.0)
 *   DATA_DIR             (./data)
 *   ALLOWED_ORIGINS      Orígenes CORS permitidos separados por comas, o * (por defecto *; la autenticación
 *                        es por token, no por cookies, así que * es seguro)
 *   TRUST_PROXY          "1" si está detrás de un proxy inverso (usa X-Forwarded-For para el límite de peticiones)
 *   ANDROID_PACKAGE      Paquete de la app (app.mochila.gastos) para /.well-known/assetlinks.json
 *   ANDROID_CERT_SHA256  Huella SHA-256 del certificado de firma (AA:BB:...) para App Links
 *   MAX_BLOB_BYTES       Tamaño máximo de cada blob (por defecto 1 MiB)
 *   MAX_DEVICES          Dispositivos por grupo (por defecto 64)
 *   GROUP_TTL_DAYS       Borra grupos sin actividad tras N días (por defecto 400)
 */
import { createHash, timingSafeEqual } from 'node:crypto'
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { join } from 'node:path'

const PORT = Number(process.env.PORT ?? 8787)
const HOST = process.env.HOST ?? '0.0.0.0'
const DATA_DIR = process.env.DATA_DIR ?? join(process.cwd(), 'data')
const ALLOWED = (process.env.ALLOWED_ORIGINS ?? '*').split(',').map((s) => s.trim()).filter(Boolean)
const TRUST_PROXY = process.env.TRUST_PROXY === '1'
const MAX_BLOB = Number(process.env.MAX_BLOB_BYTES ?? 1024 * 1024)
const MAX_DEVICES = Number(process.env.MAX_DEVICES ?? 64)
const TTL_MS = Number(process.env.GROUP_TTL_DAYS ?? 400) * 86400_000
const RATE_PER_MIN = Number(process.env.RATE_PER_MIN ?? 240)

const ID_RE = /^[A-Za-z0-9_-]{16,64}$/
const B64U_RE = /^[A-Za-z0-9_-]+$/

// ---------- almacenamiento: un fichero JSON por grupo, escritura atómica y serializada ----------

/** @type {Map<string, Promise<unknown>>} */
const locks = new Map()
function withLock(id, fn) {
  const prev = locks.get(id) ?? Promise.resolve()
  const next = prev.then(fn, fn)
  locks.set(id, next.catch(() => {}))
  return next
}

const file = (id) => join(DATA_DIR, `${id}.json`)

async function load(id) {
  try {
    return JSON.parse(await readFile(file(id), 'utf8'))
  } catch (e) {
    if (e.code === 'ENOENT') return null
    throw e
  }
}

async function save(id, group) {
  const tmp = file(id) + '.' + process.pid + '.tmp'
  await writeFile(tmp, JSON.stringify(group), { mode: 0o600 })
  await rename(tmp, file(id))
}

// ---------- utilidades HTTP ----------

const sha = (s) => createHash('sha256').update(s).digest()

function safeEqualB64(a, b) {
  const x = Buffer.from(a, 'base64url')
  const y = Buffer.from(b, 'base64url')
  return x.length === y.length && timingSafeEqual(x, y)
}

function send(res, status, body, extra = {}) {
  const data = body === undefined ? '' : typeof body === 'string' ? body : JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': typeof body === 'string' ? 'text/html; charset=utf-8' : 'application/json',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Strict-Transport-Security': 'max-age=31536000',
    ...extra,
  })
  res.end(data)
}

function cors(req, res) {
  const origin = req.headers.origin
  if (!origin) return true
  const ok = ALLOWED.includes('*') || ALLOWED.includes(origin)
  if (ok) {
    res.setHeader('Access-Control-Allow-Origin', ALLOWED.includes('*') ? '*' : origin)
    res.setHeader('Vary', 'Origin')
    res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, DELETE, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
    res.setHeader('Access-Control-Max-Age', '600')
  }
  return ok
}

async function readJson(req, limit) {
  const chunks = []
  let size = 0
  for await (const c of req) {
    size += c.length
    if (size > limit) throw Object.assign(new Error('too large'), { status: 413 })
    chunks.push(c)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
  } catch {
    throw Object.assign(new Error('bad json'), { status: 400 })
  }
}

function bearer(req) {
  const h = req.headers.authorization ?? ''
  const m = h.match(/^Bearer ([A-Za-z0-9_-]{20,128})$/)
  return m ? m[1] : null
}

/** Comprueba el token. Responde 401 tanto si el grupo no existe como si el token es incorrecto (no revela existencia). */
function authorized(group, token) {
  if (!group || !token) return false
  return safeEqualB64(sha(token).toString('base64url'), group.tokenHash)
}

// ---------- límite de peticiones por IP (ventana deslizante simple) ----------

const hits = new Map()
function rateLimited(req) {
  const ip = (TRUST_PROXY && String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim()) || req.socket.remoteAddress || '?'
  const now = Date.now()
  const arr = (hits.get(ip) ?? []).filter((t) => now - t < 60_000)
  arr.push(now)
  hits.set(ip, arr)
  return arr.length > RATE_PER_MIN
}
setInterval(() => {
  const now = Date.now()
  for (const [ip, arr] of hits) if (!arr.some((t) => now - t < 60_000)) hits.delete(ip)
}, 60_000).unref()

// ---------- página /join: abre la app con la invitación (el fragmento # nunca llega aquí) ----------

const JOIN_HTML = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Unirse a un viaje · Mochila</title>
<style>body{font-family:system-ui,sans-serif;max-width:28rem;margin:3rem auto;padding:0 1rem;color:#0f172a}a.b{display:block;text-align:center;background:#0d9488;color:#fff;padding:.9rem;border-radius:.8rem;text-decoration:none;font-weight:600}code{word-break:break-all;background:#f1f5f9;padding:.5rem;border-radius:.5rem;display:block;font-size:.75rem}</style></head>
<body><h1>🎒 Mochila</h1><p>Te han invitado a un viaje compartido. Ábrelo con la app Mochila:</p>
<p><a class="b" id="open" href="#">Abrir en la app</a></p>
<p>Si no se abre, copia este código y pégalo en <b>Mochila → Unirse a un grupo</b>:</p><code id="code"></code>
<script>var c=location.hash.slice(1);document.getElementById('code').textContent=c||'(enlace incompleto)';document.getElementById('open').href='mochila://join#'+c;</script>
</body></html>`

// ---------- rutas ----------

async function handle(req, res) {
  if (!cors(req, res)) return send(res, 403, { error: 'origin' })
  if (req.method === 'OPTIONS') return send(res, 204)
  if (rateLimited(req)) return send(res, 429, { error: 'rate' }, { 'Retry-After': '30' })

  const url = new URL(req.url ?? '/', 'http://x')
  const parts = url.pathname.split('/').filter(Boolean)

  if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { ok: true })
  if (req.method === 'GET' && url.pathname === '/join')
    return send(res, 200, JOIN_HTML, { 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'" })
  if (req.method === 'GET' && url.pathname === '/.well-known/assetlinks.json') {
    const pkg = process.env.ANDROID_PACKAGE
    const cert = process.env.ANDROID_CERT_SHA256
    if (!pkg || !cert) return send(res, 404, { error: 'not configured' })
    return send(res, 200, [
      { relation: ['delegate_permission/common.handle_all_urls'], target: { namespace: 'android_app', package_name: pkg, sha256_cert_fingerprints: cert.split(',') } },
    ])
  }

  // /v1/g/:groupId[/d/:deviceId]
  if (parts[0] !== 'v1' || parts[1] !== 'g' || !ID_RE.test(parts[2] ?? '')) return send(res, 404, { error: 'not found' })
  const gid = parts[2]

  // Crear grupo
  if (req.method === 'PUT' && parts.length === 3) {
    const body = await readJson(req, 4096)
    if (typeof body.tokenHash !== 'string' || !B64U_RE.test(body.tokenHash) || Buffer.from(body.tokenHash, 'base64url').length !== 32)
      return send(res, 400, { error: 'tokenHash' })
    return withLock(gid, async () => {
      if (await load(gid)) return send(res, 409, { error: 'exists' })
      const now = Date.now()
      await save(gid, { tokenHash: body.tokenHash, version: 0, createdAt: now, touchedAt: now, devices: {} })
      return send(res, 201, { ok: true })
    })
  }

  const token = bearer(req)

  // Leer cambios
  if (req.method === 'GET' && parts.length === 3) {
    const group = await load(gid)
    if (!authorized(group, token)) return send(res, 401, { error: 'unauthorized' })
    const after = Math.max(0, Number(url.searchParams.get('after')) || 0)
    const items = Object.entries(group.devices)
      .filter(([, d]) => d.version > after)
      .map(([deviceId, d]) => ({ deviceId, version: d.version, blob: d.blob }))
    return send(res, 200, { version: group.version, items })
  }

  // Subir instantánea de un dispositivo
  if (req.method === 'PUT' && parts.length === 5 && parts[3] === 'd' && ID_RE.test(parts[4])) {
    const body = await readJson(req, MAX_BLOB + 1024)
    if (typeof body.blob !== 'string' || !B64U_RE.test(body.blob) || body.blob.length > MAX_BLOB) return send(res, 400, { error: 'blob' })
    return withLock(gid, async () => {
      const group = await load(gid)
      if (!authorized(group, token)) return send(res, 401, { error: 'unauthorized' })
      if (!group.devices[parts[4]] && Object.keys(group.devices).length >= MAX_DEVICES) return send(res, 403, { error: 'too many devices' })
      group.version += 1
      group.touchedAt = Date.now()
      group.devices[parts[4]] = { version: group.version, blob: body.blob, at: group.touchedAt }
      await save(gid, group)
      return send(res, 200, { version: group.version })
    })
  }

  // Borrar grupo
  if (req.method === 'DELETE' && parts.length === 3) {
    return withLock(gid, async () => {
      const group = await load(gid)
      if (!authorized(group, token)) return send(res, 401, { error: 'unauthorized' })
      await rm(file(gid), { force: true })
      return send(res, 200, { ok: true })
    })
  }

  return send(res, 405, { error: 'method' })
}

async function sweep() {
  try {
    const now = Date.now()
    for (const f of await readdir(DATA_DIR)) {
      if (!f.endsWith('.json')) continue
      const s = await stat(join(DATA_DIR, f))
      if (now - s.mtimeMs > TTL_MS) await rm(join(DATA_DIR, f), { force: true })
    }
  } catch {
    /* ignorar */
  }
}

export async function start({ port = PORT, host = HOST } = {}) {
  await mkdir(DATA_DIR, { recursive: true, mode: 0o700 })
  const server = createServer((req, res) => {
    handle(req, res).catch((e) => {
      if (!res.headersSent) send(res, e.status ?? 500, { error: e.status ? e.message : 'internal' })
      if (!e.status) console.error(e)
    })
  })
  server.requestTimeout = 15_000
  server.headersTimeout = 10_000
  await new Promise((r) => server.listen(port, host, r))
  setInterval(sweep, 6 * 3600_000).unref()
  return server
}

if (import.meta.url === `file://${process.argv[1]}`) {
  start().then((s) => console.log(`Mochila relay escuchando en http://${HOST}:${s.address().port} · datos en ${DATA_DIR}`))
}
