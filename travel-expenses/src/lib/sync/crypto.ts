/**
 * Criptografía del grupo compartido (WebCrypto, sin dependencias).
 *
 *  secreto del grupo (32 bytes aleatorios, sólo en los dispositivos de los miembros)
 *    ├─ HKDF "mochila/v1/enc"  → clave AES-256-GCM: cifra el contenido
 *    └─ HKDF "mochila/v1/auth" → token de acceso: el servidor sólo guarda su SHA-256
 *
 *  identidad del dispositivo: par de claves ECDSA P-256. deviceId = huella SHA-256 de la clave pública,
 *  de modo que nadie puede hacerse pasar por otro dispositivo sin su clave privada.
 */

const subtle = () => globalThis.crypto.subtle
const enc = new TextEncoder()
const dec = new TextDecoder()

export const PROTOCOL = 'mochila/v1'

export function b64u(bytes: ArrayBuffer | Uint8Array): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let s = ''
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i])
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function unb64u(s: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) throw new Error('base64url no válido')
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4))
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export function randomBytes(n: number): Uint8Array<ArrayBuffer> {
  return globalThis.crypto.getRandomValues(new Uint8Array(n))
}

export async function sha256(data: string | Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await subtle().digest('SHA-256', typeof data === 'string' ? enc.encode(data) : data))
}

export interface GroupKeys {
  encKey: CryptoKey
  /** Token que se presenta al servidor (Bearer) */
  token: string
}

export async function deriveGroupKeys(secretB64: string, groupId: string): Promise<GroupKeys> {
  const secret = unb64u(secretB64)
  if (secret.length !== 32) throw new Error('Secreto de grupo no válido')
  const ikm = await subtle().importKey('raw', secret, 'HKDF', false, ['deriveKey', 'deriveBits'])
  const salt = enc.encode(`${PROTOCOL}|${groupId}`)
  const encKey = await subtle().deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt, info: enc.encode(`${PROTOCOL}/enc`) },
    ikm,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
  const tokenBits = await subtle().deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info: enc.encode(`${PROTOCOL}/auth`) }, ikm, 256)
  return { encKey, token: b64u(tokenBits) }
}

/** Lo que el servidor guarda para comprobar el token sin poder derivar nada de él. */
export async function tokenHash(token: string): Promise<string> {
  return b64u(await sha256(token))
}

// ---------- Identidad del dispositivo ----------

export interface DeviceIdentity {
  deviceId: string
  publicJwk: JsonWebKey
  privateKey: CryptoKey
}

function canonicalPub(jwk: JsonWebKey): string {
  // Orden fijo de campos (RFC 7638) para que la huella sea estable
  return JSON.stringify({ crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y })
}

export async function deviceIdFor(jwk: JsonWebKey): Promise<string> {
  return b64u((await sha256(canonicalPub(jwk))).slice(0, 16))
}

export async function generateIdentity(): Promise<DeviceIdentity> {
  const pair = await subtle().generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  const publicJwk = await subtle().exportKey('jwk', pair.publicKey)
  // La clave privada se reimporta como NO exportable: ni siquiera el código de la app puede leerla
  const pkcs8 = await subtle().exportKey('pkcs8', pair.privateKey)
  const privateKey = await subtle().importKey('pkcs8', pkcs8, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  return { deviceId: await deviceIdFor(publicJwk), publicJwk: JSON.parse(canonicalPub(publicJwk)), privateKey }
}

// ---------- Sobres cifrados y firmados ----------

interface SignedPayload {
  v: 1
  deviceId: string
  pub: JsonWebKey
  /** Contenido (texto) */
  body: string
  sig: string
}

function signingInput(groupId: string, deviceId: string, body: string) {
  return enc.encode(`${PROTOCOL}|sig|${groupId}|${deviceId}|${body}`)
}

function aad(groupId: string, deviceId: string) {
  return enc.encode(`${PROTOCOL}|aad|${groupId}|${deviceId}`)
}

/** Firma con la clave del dispositivo y cifra con la clave del grupo. Devuelve un blob opaco en base64url. */
export async function seal(body: string, groupId: string, keys: GroupKeys, id: DeviceIdentity): Promise<string> {
  const sig = await subtle().sign({ name: 'ECDSA', hash: 'SHA-256' }, id.privateKey, signingInput(groupId, id.deviceId, body))
  const payload: SignedPayload = { v: 1, deviceId: id.deviceId, pub: id.publicJwk, body, sig: b64u(sig) }
  const iv = randomBytes(12)
  const ct = await subtle().encrypt({ name: 'AES-GCM', iv, additionalData: aad(groupId, id.deviceId) }, keys.encKey, enc.encode(JSON.stringify(payload)))
  const out = new Uint8Array(12 + ct.byteLength)
  out.set(iv, 0)
  out.set(new Uint8Array(ct), 12)
  return b64u(out)
}

export class SealError extends Error {}

/**
 * Descifra y verifica un blob. Comprueba que:
 *  - fue cifrado con la clave del grupo y para este grupo/dispositivo (AES-GCM + datos asociados),
 *  - la firma es válida y la clave pública corresponde al deviceId declarado.
 */
export async function open(blob: string, groupId: string, deviceId: string, keys: GroupKeys): Promise<string> {
  const raw = unb64u(blob)
  if (raw.length < 13) throw new SealError('Mensaje demasiado corto')
  let pt: ArrayBuffer
  try {
    pt = await subtle().decrypt({ name: 'AES-GCM', iv: raw.slice(0, 12), additionalData: aad(groupId, deviceId) }, keys.encKey, raw.slice(12))
  } catch {
    throw new SealError('No se pudo descifrar: clave incorrecta o datos manipulados')
  }
  const p = JSON.parse(dec.decode(pt)) as SignedPayload
  if (p.v !== 1 || p.deviceId !== deviceId) throw new SealError('Remitente no coincide')
  if ((await deviceIdFor(p.pub)) !== deviceId) throw new SealError('La clave pública no corresponde al dispositivo')
  const pub = await subtle().importKey('jwk', p.pub, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'])
  const ok = await subtle().verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, unb64u(p.sig), signingInput(groupId, deviceId, p.body))
  if (!ok) throw new SealError('Firma no válida')
  return p.body
}

/**
 * Código de seguridad del grupo: 16 cifras derivadas del grupo y su secreto.
 * Si dos personas ven el mismo código, están en el mismo grupo con la misma clave
 * (nadie ha sustituido la invitación por el camino).
 */
export async function safetyCode(groupId: string, secret: string): Promise<string> {
  const h = await sha256(`${PROTOCOL}|safety|${groupId}|${secret}`)
  let digits = ''
  for (let i = 0; digits.length < 16; i += 2) digits += String(((h[i] << 8) | h[i + 1]) % 10000).padStart(4, '0')
  return digits.match(/.{4}/g)!.join(' ')
}
