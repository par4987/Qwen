import { useCallback, useEffect, useRef } from 'react'
import { useStore } from '../store'
import type { Trip } from '../types'
import { mergeTrips } from '../share'
import { pull, push, SyncError, tripHash } from './client'
import { getIdentity } from './identity'

const INTERVAL_MS = 20_000
const DEBOUNCE_MS = 1_500

/**
 * Motor de sincronización: para cada viaje con grupo compartido
 *  1. descarga las instantáneas nuevas de los demás dispositivos y las fusiona,
 *  2. si la copia resultante cambió desde la última subida, sube la nueva instantánea cifrada.
 * Se ejecuta al abrir la app, al volver a ella, al recuperar conexión, cada 20 s y tras cada cambio local.
 */
export function useSync() {
  const { trips, dispatch } = useStore()
  const tripsRef = useRef(trips)
  tripsRef.current = trips
  const running = useRef(new Map<string, Promise<void>>())

  const syncTrip = useCallback(
    (tripId: string, force = false): Promise<void> => {
      const current = running.current.get(tripId)
      if (current) return current
      const job = (async () => {
        const t = tripsRef.current.find((x) => x.id === tripId)
        const cfg = t?.sync
        if (!t || !cfg || (cfg.revoked && !force)) return
        const groupId = cfg.groupId
        try {
          const id = await getIdentity()
          const r = await pull(cfg, id)
          if (r.trips.length) dispatch({ type: 'mergeRemote', tripId, remotes: r.trips })
          // Lo que habrá en el estado tras la fusión (la fusión es determinista)
          const latest = tripsRef.current.find((x) => x.id === tripId) ?? t
          const merged: Trip = r.trips.reduce((acc, x) => mergeTrips(acc, x), latest)
          const hash = await tripHash(merged)
          const patch: Partial<NonNullable<Trip['sync']>> = {
            cursor: r.cursor,
            lastSyncAt: Date.now(),
            lastError: r.rejected ? `${r.rejected} copia(s) ignoradas por no superar la verificación` : undefined,
            revoked: false,
          }
          if (hash !== cfg.pushedHash) {
            await push(merged, cfg, id)
            patch.pushedHash = hash
          }
          patch.pushedAt = merged.updatedAt
          dispatch({ type: 'patchSync', tripId, groupId, patch })
        } catch (e) {
          const status = e instanceof SyncError ? e.status : undefined
          dispatch({
            type: 'patchSync',
            tripId,
            groupId,
            patch: {
              lastError: e instanceof Error ? e.message : 'Error de sincronización',
              revoked: status === 401 || status === 404,
            },
          })
        } finally {
          running.current.delete(tripId)
        }
      })()
      running.current.set(tripId, job)
      return job
    },
    [dispatch],
  )

  const syncAll = useCallback(() => {
    for (const t of tripsRef.current) if (t.sync && !t.sync.revoked) void syncTrip(t.id)
  }, [syncTrip])

  // Cambios locales → sincronizar con un pequeño retardo
  const pendingKey = trips
    .filter((t) => t.sync && !t.sync.revoked && t.updatedAt !== t.sync.pushedAt)
    .map((t) => `${t.id}:${t.updatedAt}`)
    .join(',')
  useEffect(() => {
    if (!pendingKey) return
    const timer = setTimeout(syncAll, DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [pendingKey, syncAll])

  useEffect(() => {
    syncAll()
    const tick = setInterval(() => document.visibilityState === 'visible' && navigator.onLine && syncAll(), INTERVAL_MS)
    const onVisible = () => document.visibilityState === 'visible' && syncAll()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', syncAll)
    return () => {
      clearInterval(tick)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', syncAll)
    }
  }, [syncAll])

  return syncTrip
}
