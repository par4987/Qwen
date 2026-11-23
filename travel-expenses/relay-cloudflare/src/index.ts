/**
 * Mochila Relay para Cloudflare Workers — misma API que relay/server.mjs.
 *
 * Servidor "ciego": sólo guarda, por grupo y dispositivo, un blob cifrado de extremo a extremo.
 * Para leer o escribir hay que presentar un token derivado del secreto del grupo; aquí sólo se guarda su SHA-256.
 *
 *   PUT    /v1/g/:grupo                  { tokenHash }  → crea el grupo (409 si existe)
 *   GET    /v1/g/:grupo?after=N          Bearer token   → instantáneas con versión > N
 *   PUT    /v1/g/:grupo/d/:dispositivo   Bearer token   { blob } → guarda/reemplaza la instantánea
 *   DELETE /v1/g/:grupo                  Bearer token   → borra el grupo
 *   GET    /health · /join · /.well-known/assetlinks.json
 */
import { DurableObject } from 'cloudflare:workers'

export interface Env {
  GROUPS: DurableObjectNamespace<GroupStore>
  LIMITER?: RateLimit
  ALLOWED_ORIGINS?: string
  MAX_BLOB_BYTES?: string
  MAX_DEVICES?: string
  GROUP_TTL_DAYS?: string
  ANDROID_PACKAGE?: string
  ANDROID_CERT_SHA256?: string
}

const ID_RE = /^[A-Za-z0-9_-]{16,64}$/
const B64U_RE = /^[A-Za-z0-9_-]+$/

interface Meta {
  tokenHash: string
  version: number
  createdAt: number
  touchedAt: number
}

interface Device {
  version: number
  blob: string
  at: number
}

type Result = { status: number; body: unknown }

const enc = new TextEncoder()

function b64uToBytes(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4))
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

async function sha256(s: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s)))
}

// ---------- Durable Object: un grupo ----------

export class GroupStore extends DurableObject<Env> {
  private ttl(): number {
    return Number(this.env.GROUP_TTL_DAYS ?? 400) * 86_400_000
  }

  private async authorized(token: string | null): Promise<Meta | null> {
    const meta = await this.ctx.storage.get<Meta>('meta')
    if (!meta || !token) return null
    const a = await sha256(token)
    const b = b64uToBytes(meta.tokenHash)
    return a.byteLength === b.byteLength && crypto.subtle.timingSafeEqual(a, b) ? meta : null
  }

  async create(tokenHash: string): Promise<Result> {
    if (await this.ctx.storage.get('meta')) return { status: 409, body: { error: 'exists' } }
    const now = Date.now()
    await this.ctx.storage.put<Meta>('meta', { tokenHash, version: 0, createdAt: now, touchedAt: now })
    await this.ctx.storage.setAlarm(now + this.ttl())
    return { status: 201, body: { ok: true } }
  }

  async list(token: string | null, after: number): Promise<Result> {
    const meta = await this.authorized(token)
    if (!meta) return { status: 401, body: { error: 'unauthorized' } }
    const devices = await this.ctx.storage.list<Device>({ prefix: 'd:' })
    const items = [...devices]
      .filter(([, d]) => d.version > after)
      .map(([k, d]) => ({ deviceId: k.slice(2), version: d.version, blob: d.blob }))
    return { status: 200, body: { version: meta.version, items } }
  }

  async put(token: string | null, deviceId: string, blob: string): Promise<Result> {
    const meta = await this.authorized(token)
    if (!meta) return { status: 401, body: { error: 'unauthorized' } }
    const key = `d:${deviceId}`
    if (!(await this.ctx.storage.get(key))) {
      const count = (await this.ctx.storage.list({ prefix: 'd:' })).size
      if (count >= Number(this.env.MAX_DEVICES ?? 64)) return { status: 403, body: { error: 'too many devices' } }
    }
    const now = Date.now()
    const next: Meta = { ...meta, version: meta.version + 1, touchedAt: now }
    // Ambas escrituras en la misma transacción implícita del Durable Object
    await this.ctx.storage.put({ meta: next, [key]: { version: next.version, blob, at: now } satisfies Device })
    await this.ctx.storage.setAlarm(now + this.ttl())
    return { status: 200, body: { version: next.version } }
  }

  async destroy(token: string | null): Promise<Result> {
    if (!(await this.authorized(token))) return { status: 401, body: { error: 'unauthorized' } }
    await this.ctx.storage.deleteAlarm()
    await this.ctx.storage.deleteAll()
    return { status: 200, body: { ok: true } }
  }

  /** Borra los grupos sin actividad durante GROUP_TTL_DAYS. */
  async alarm(): Promise<void> {
    const meta = await this.ctx.storage.get<Meta>('meta')
    if (!meta || Date.now() - meta.touchedAt >= this.ttl()) {
      await this.ctx.storage.deleteAll()
      return
    }
    await this.ctx.storage.setAlarm(meta.touchedAt + this.ttl())
  }
}

// ---------- Worker: enrutado, validación, CORS y límites ----------

const SECURITY_HEADERS = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Strict-Transport-Security': 'max-age=31536000',
}

const JOIN_HTML = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Unirse a un viaje · Mochila</title>
<style>body{font-family:system-ui,sans-serif;max-width:28rem;margin:3rem auto;padding:0 1rem;color:#0f172a}a.b{display:block;text-align:center;background:#0d9488;color:#fff;padding:.9rem;border-radius:.8rem;text-decoration:none;font-weight:600}code{word-break:break-all;background:#f1f5f9;padding:.5rem;border-radius:.5rem;display:block;font-size:.75rem}</style></head>
<body><h1>🎒 Mochila</h1><p>Te han invitado a un viaje compartido. Ábrelo con la app Mochila:</p>
<p><a class="b" id="open" href="#">Abrir en la app</a></p>
<p>Si no se abre, copia este código y pégalo en <b>Mochila → Unirse a un grupo</b>:</p><code id="code"></code>
<script>var c=location.hash.slice(1);document.getElementById('code').textContent=c||'(enlace incompleto)';document.getElementById('open').href='mochila://join#'+c;</script>
</body></html>`

function corsHeaders(req: Request, env: Env): Record<string, string> | null {
  const origin = req.headers.get('Origin')
  if (!origin) return {}
  const allowed = (env.ALLOWED_ORIGINS ?? '*').split(',').map((s) => s.trim())
  const any = allowed.includes('*')
  if (!any && !allowed.includes(origin)) return null
  return {
    'Access-Control-Allow-Origin': any ? '*' : origin,
    Vary: 'Origin',
    'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '600',
  }
}

function json(status: number, body: unknown, extra: Record<string, string> = {}): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...SECURITY_HEADERS, ...extra },
  })
}

class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
  }
}

async function readJson(req: Request, limit: number): Promise<Record<string, unknown>> {
  const len = Number(req.headers.get('Content-Length') ?? 0)
  if (len > limit) throw new HttpError(413, 'too large')
  const text = await req.text()
  if (text.length > limit) throw new HttpError(413, 'too large')
  try {
    const v = JSON.parse(text || '{}')
    return v && typeof v === 'object' ? v : {}
  } catch {
    throw new HttpError(400, 'bad json')
  }
}

function bearer(req: Request): string | null {
  const m = (req.headers.get('Authorization') ?? '').match(/^Bearer ([A-Za-z0-9_-]{20,128})$/)
  return m ? m[1] : null
}

async function route(req: Request, env: Env, cors: Record<string, string>): Promise<Response> {
  const url = new URL(req.url)
  const parts = url.pathname.split('/').filter(Boolean)

  if (req.method === 'GET' && url.pathname === '/health') return json(200, { ok: true }, cors)
  if (req.method === 'GET' && url.pathname === '/join')
    return new Response(JOIN_HTML, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        ...SECURITY_HEADERS,
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'",
      },
    })
  if (req.method === 'GET' && url.pathname === '/.well-known/assetlinks.json') {
    if (!env.ANDROID_PACKAGE || !env.ANDROID_CERT_SHA256) return json(404, { error: 'not configured' })
    return json(200, [
      {
        relation: ['delegate_permission/common.handle_all_urls'],
        target: { namespace: 'android_app', package_name: env.ANDROID_PACKAGE, sha256_cert_fingerprints: env.ANDROID_CERT_SHA256.split(',') },
      },
    ])
  }

  if (parts[0] !== 'v1' || parts[1] !== 'g' || !ID_RE.test(parts[2] ?? '')) return json(404, { error: 'not found' }, cors)
  const stub = env.GROUPS.get(env.GROUPS.idFromName(parts[2]))
  const token = bearer(req)
  let r: Result

  if (req.method === 'PUT' && parts.length === 3) {
    const body = await readJson(req, 4096)
    const th = body.tokenHash
    if (typeof th !== 'string' || !B64U_RE.test(th) || b64uToBytes(th).length !== 32) return json(400, { error: 'tokenHash' }, cors)
    r = await stub.create(th)
  } else if (req.method === 'GET' && parts.length === 3) {
    r = await stub.list(token, Math.max(0, Number(url.searchParams.get('after')) || 0))
  } else if (req.method === 'PUT' && parts.length === 5 && parts[3] === 'd' && ID_RE.test(parts[4])) {
    const max = Number(env.MAX_BLOB_BYTES ?? 1048576)
    const body = await readJson(req, max + 1024)
    const blob = body.blob
    if (typeof blob !== 'string' || !B64U_RE.test(blob) || blob.length > max) return json(400, { error: 'blob' }, cors)
    r = await stub.put(token, parts[4], blob)
  } else if (req.method === 'DELETE' && parts.length === 3) {
    r = await stub.destroy(token)
  } else {
    return json(405, { error: 'method' }, cors)
  }
  return json(r.status, r.body, cors)
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const cors = corsHeaders(req, env)
    if (!cors) return json(403, { error: 'origin' })
    if (req.method === 'OPTIONS') return json(204, null, cors)

    if (env.LIMITER) {
      const ip = req.headers.get('CF-Connecting-IP') ?? 'unknown'
      const { success } = await env.LIMITER.limit({ key: ip })
      if (!success) return json(429, { error: 'rate' }, { ...cors, 'Retry-After': '30' })
    }

    try {
      return await route(req, env, cors)
    } catch (e) {
      if (e instanceof HttpError) return json(e.status, { error: e.message }, cors)
      console.error(e)
      return json(500, { error: 'internal' }, cors)
    }
  },
} satisfies ExportedHandler<Env>
