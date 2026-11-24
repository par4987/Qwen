import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string'
import type { Trip } from './types'

/**
 * Compartir sin servidor ni registro: el viaje completo viaja comprimido en el fragmento (#) del enlace.
 * El fragmento nunca se envía al servidor que aloja la app, así que los datos sólo los ven quienes tengan el enlace.
 */
export function encodeTrip(trip: Trip): string {
  return compressToEncodedURIComponent(JSON.stringify(trip))
}

export function decodeTrip(data: string): Trip | null {
  try {
    const json = decompressFromEncodedURIComponent(data)
    if (!json) return null
    const t = JSON.parse(json) as Trip
    return isTrip(t) ? t : null
  } catch {
    return null
  }
}

/** Copia del viaje apta para compartir: sin la configuración del grupo (que contiene el secreto). */
export function publicTrip(trip: Trip): Trip {
  const { sync: _sync, ...rest } = trip
  void _sync
  return rest
}

export function shareUrl(trip: Trip): string {
  const { origin, pathname } = window.location
  return `${origin}${pathname}#import=${encodeTrip(publicTrip(trip))}`
}

export function isTrip(t: unknown): t is Trip {
  if (!t || typeof t !== 'object') return false
  const o = t as Record<string, unknown>
  return (
    typeof o.id === 'string' &&
    typeof o.name === 'string' &&
    typeof o.baseCurrency === 'string' &&
    Array.isArray(o.participants) &&
    Array.isArray(o.expenses)
  )
}

/**
 * Fusiona dos versiones del mismo viaje (p. ej. el que tengo y el que me envían):
 * por cada gasto/participante gana la versión editada más recientemente; los nuevos se añaden.
 */
export function mergeTrips(local: Trip, incoming: Trip): Trip {
  // Datos del viaje: gana la versión editada más recientemente
  const lm = local.metaUpdatedAt ?? local.createdAt
  const im = incoming.metaUpdatedAt ?? incoming.createdAt
  const meta = im > lm ? incoming : local
  const other = meta === local ? incoming : local
  // Los viajeros nunca se pierden: se unen ambas listas (la versión más reciente manda en nombre y color)
  const participants = [...meta.participants]
  for (const p of other.participants) if (!participants.some((x) => x.id === p.id)) participants.push(p)

  // Borrados: unión de ambos registros
  const deleted: Record<string, number> = { ...(local.deleted ?? {}) }
  for (const [id, ts] of Object.entries(incoming.deleted ?? {})) deleted[id] = Math.max(deleted[id] ?? 0, ts)

  const byId = new Map(local.expenses.map((e) => [e.id, e]))
  for (const e of incoming.expenses) {
    const cur = byId.get(e.id)
    if (!cur || e.updatedAt > cur.updatedAt) byId.set(e.id, e)
  }
  // Un gasto borrado sólo "revive" si alguien lo editó después del borrado
  for (const [id, ts] of Object.entries(deleted)) {
    const e = byId.get(id)
    if (e && e.updatedAt <= ts) byId.delete(id)
  }

  return {
    ...meta,
    sync: local.sync,
    participants,
    deleted,
    metaUpdatedAt: Math.max(lm, im),
    expenses: [...byId.values()].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt),
    rates: { ...other.rates, ...meta.rates },
    createdAt: Math.min(local.createdAt, incoming.createdAt),
    updatedAt: Math.max(local.updatedAt, incoming.updatedAt),
  }
}
