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

export function shareUrl(trip: Trip): string {
  const { origin, pathname } = window.location
  return `${origin}${pathname}#import=${encodeTrip(trip)}`
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
  const participants = [...local.participants]
  for (const p of incoming.participants) {
    const i = participants.findIndex((x) => x.id === p.id)
    if (i === -1) participants.push(p)
  }
  const byId = new Map(local.expenses.map((e) => [e.id, e]))
  for (const e of incoming.expenses) {
    const cur = byId.get(e.id)
    if (!cur || e.updatedAt > cur.updatedAt) byId.set(e.id, e)
  }
  const newer = incoming.updatedAt > local.updatedAt ? incoming : local
  return {
    ...newer,
    participants,
    expenses: [...byId.values()].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt),
    rates: { ...local.rates, ...incoming.rates },
    updatedAt: Math.max(local.updatedAt, incoming.updatedAt),
  }
}
