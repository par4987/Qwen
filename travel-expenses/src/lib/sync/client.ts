import { compressToUTF16, decompressFromUTF16 } from 'lz-string'
import { isTrip, publicTrip } from '../share'
import type { SyncConfig, Trip } from '../types'
import { b64u, deriveGroupKeys, open, randomBytes, seal, sha256, tokenHash, unb64u, type DeviceIdentity, type GroupKeys } from './crypto'

/**
 * Sincronización del grupo a través de un servidor "ciego".
 *
 * Cada dispositivo sube al servidor UNA instantánea cifrada y firmada de su copia del viaje
 * (la reemplaza en cada cambio). Los demás descargan las instantáneas nuevas, las descifran,
 * verifican la firma y las fusionan con `mergeTrips` (última edición gana por gasto, con
 * registro de borrados). La fusión es conmutativa, así que da igual el orden de llegada y
 * cualquier miembro puede reconstruir el viaje aunque el creador esté desconectado.
 */

export interface Invite {
  relay: string
  groupId: string
  secret: string
  name?: string
}

const INVITE_PREFIX = 'MOCHILA1.'

export function encodeInvite(i: Invite): string {
  const json = JSON.stringify({ r: i.relay, g: i.groupId, k: i.secret, n: i.name })
  return INVITE_PREFIX + b64u(new TextEncoder().encode(json))
}

export function decodeInvite(code: string): Invite | null {
  const m = code.trim().match(/MOCHILA1\.([A-Za-z0-9_-]+)/)
  if (!m) return null
  try {
    const o = JSON.parse(new TextDecoder().decode(unb64u(m[1])))
    const relay = normalizeRelay(o.r)
    if (!relay || typeof o.g !== 'string' || typeof o.k !== 'string' || unb64u(o.k).length !== 32) return null
    return { relay, groupId: o.g, secret: o.k, name: typeof o.n === 'string' ? o.n : undefined }
  } catch {
    return null
  }
}

/** Enlace de invitación. Los datos van tras '#', que el navegador nunca envía al servidor. */
export function inviteLink(i: Invite): string {
  return `${i.relay}/join#${encodeInvite(i)}`
}

export function normalizeRelay(url: unknown): string | null {
  if (typeof url !== 'string') return null
  try {
    const u = new URL(url.trim())
    const local = ['localhost', '127.0.0.1', '10.0.2.2'].includes(u.hostname)
    // Sólo HTTPS (salvo servidores locales de desarrollo)
    if (u.protocol !== 'https:' && !(u.protocol === 'http:' && local)) return null
    return u.origin + u.pathname.replace(/\/+$/, '')
  } catch {
    return null
  }
}

export class SyncError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message)
  }
}

async function api<T>(relay: string, path: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (init.token) headers.Authorization = `Bearer ${init.token}`
  let res: Response
  try {
    res = await fetch(relay + path, { ...init, headers, cache: 'no-store' })
  } catch {
    throw new SyncError('Sin conexión con el servidor')
  }
  if (!res.ok) {
    const msg: Record<number, string> = {
      401: 'Acceso denegado: el enlace del grupo ya no es válido',
      404: 'El grupo ya no existe en el servidor',
      409: 'El grupo ya existe',
      413: 'El viaje es demasiado grande para el servidor',
      429: 'Demasiadas peticiones, se reintentará',
    }
    throw new SyncError(msg[res.status] ?? `Error del servidor (${res.status})`, res.status)
  }
  return (await res.json()) as T
}

const keyCache = new Map<string, Promise<GroupKeys>>()
function keysFor(cfg: Pick<SyncConfig, 'secret' | 'groupId'>) {
  const k = cfg.groupId + cfg.secret
  let p = keyCache.get(k)
  if (!p) {
    p = deriveGroupKeys(cfg.secret, cfg.groupId)
    keyCache.set(k, p)
  }
  return p
}

/** Huella del contenido compartible del viaje, para saber si hay que volver a subirlo. */
export async function tripHash(trip: Trip): Promise<string> {
  const { updatedAt: _u, ...rest } = publicTrip(trip)
  void _u
  return b64u((await sha256(JSON.stringify(rest))).slice(0, 12))
}

export async function createGroup(relayUrl: string): Promise<Pick<SyncConfig, 'relay' | 'groupId' | 'secret'>> {
  const relay = normalizeRelay(relayUrl)
  if (!relay) throw new SyncError('La dirección del servidor debe empezar por https://')
  const groupId = b64u(randomBytes(16))
  const secret = b64u(randomBytes(32))
  const { token } = await deriveGroupKeys(secret, groupId)
  await api(relay, `/v1/g/${groupId}`, { method: 'PUT', body: JSON.stringify({ tokenHash: await tokenHash(token) }) })
  return { relay, groupId, secret }
}

export async function deleteGroup(cfg: SyncConfig): Promise<void> {
  const { token } = await keysFor(cfg)
  await api(cfg.relay, `/v1/g/${cfg.groupId}`, { method: 'DELETE', token })
}

export async function push(trip: Trip, cfg: SyncConfig, id: DeviceIdentity): Promise<void> {
  const keys = await keysFor(cfg)
  const body = compressToUTF16(JSON.stringify(publicTrip(trip)))
  const blob = await seal(body, cfg.groupId, keys, id)
  await api(cfg.relay, `/v1/g/${cfg.groupId}/d/${id.deviceId}`, { method: 'PUT', token: keys.token, body: JSON.stringify({ blob }) })
}

export interface PullResult {
  trips: Trip[]
  cursor: number
  /** Instantáneas rechazadas (firma o cifrado inválidos) */
  rejected: number
}

export async function pull(cfg: Pick<SyncConfig, 'relay' | 'groupId' | 'secret' | 'cursor'>, id: DeviceIdentity): Promise<PullResult> {
  const keys = await keysFor(cfg)
  const res = await api<{ version: number; items: { deviceId: string; version: number; blob: string }[] }>(
    cfg.relay,
    `/v1/g/${cfg.groupId}?after=${cfg.cursor}`,
    { token: keys.token },
  )
  const trips: Trip[] = []
  let rejected = 0
  for (const it of res.items) {
    if (it.deviceId === id.deviceId) continue
    try {
      const body = await open(it.blob, cfg.groupId, it.deviceId, keys)
      const trip = JSON.parse(decompressFromUTF16(body) ?? 'null')
      if (!isTrip(trip)) throw new Error('contenido no válido')
      trips.push(trip)
    } catch {
      rejected++
    }
  }
  return { trips, cursor: res.version, rejected }
}
