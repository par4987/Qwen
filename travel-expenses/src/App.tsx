import { useEffect, useRef, useState } from 'react'
import { Avatar, Sheet, toast } from './components/ui'
import { isNative } from './lib/platform'
import { decodeTrip } from './lib/share'
import { useStore } from './lib/store'
import { useSync } from './lib/sync/useSync'
import { useJoin } from './views/JoinSheet'
import { TripList } from './views/TripList'
import { TripView } from './views/TripView'

const LAST_KEY = 'mochila.last'

function readLast(): string | null {
  try {
    return localStorage.getItem(LAST_KEY)
  } catch {
    return null
  }
}

export default function App() {
  const { getTrip, dispatch, me } = useStore()
  const [tripId, setTripId] = useState<string | null>(readLast)
  const [askMe, setAskMe] = useState<string | null>(null)
  const syncTrip = useSync()
  const meRef = useRef(me)
  meRef.current = me

  const onJoined = (id: string) => {
    setTripId(id)
    if (!meRef.current[id]) setAskMe(id)
  }
  const join = useJoin(onJoined)
  const joinRef = useRef(join)
  joinRef.current = join

  // Importar un viaje recibido por enlace (#import=...) o unirse con #join=...
  useEffect(() => {
    const handle = () => {
      const hash = window.location.hash
      const inv = hash.match(/MOCHILA1\.[A-Za-z0-9_-]+/)
      const m = hash.match(/^#import=(.+)$/)
      if (!m && !inv) return
      history.replaceState(null, '', window.location.pathname + window.location.search)
      if (inv) return void joinRef.current(inv[0])
      const trip = decodeTrip(m![1])
      if (!trip) return toast('El enlace no es válido o está incompleto')
      const existed = !!getTrip(trip.id)
      dispatch({ type: 'importTrip', trip })
      toast(existed ? 'Cambios del grupo fusionados' : `Te has unido a «${trip.name}»`)
      onJoined(trip.id)
    }
    handle()
    window.addEventListener('hashchange', handle)
    return () => window.removeEventListener('hashchange', handle)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getTrip, dispatch])

  // Android: enlaces mochila://join#... y botón "atrás" del sistema
  useEffect(() => {
    if (!isNative) return
    let cleanup: (() => void) | undefined
    import('@capacitor/app').then(({ App: CapApp }) => {
      const subs = [
        CapApp.addListener('appUrlOpen', ({ url }) => {
          const inv = url.match(/MOCHILA1\.[A-Za-z0-9_-]+/)
          if (inv) void joinRef.current(inv[0])
        }),
        CapApp.addListener('backButton', () => {
          if (document.querySelector('[role="dialog"]')) {
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
          } else if (history.state?.trip) history.back()
          else void CapApp.minimizeApp()
        }),
      ]
      CapApp.getLaunchUrl().then((r) => {
        const inv = r?.url.match(/MOCHILA1\.[A-Za-z0-9_-]+/)
        if (inv) void joinRef.current(inv[0])
      })
      cleanup = () => subs.forEach((s) => s.then((h) => h.remove()))
    })
    return () => cleanup?.()
  }, [])

  useEffect(() => {
    try {
      if (tripId) localStorage.setItem(LAST_KEY, tripId)
      else localStorage.removeItem(LAST_KEY)
    } catch {
      /* ignorar */
    }
  }, [tripId])

  // Botón "atrás" vuelve a la lista
  useEffect(() => {
    if (!tripId) return
    history.pushState({ trip: tripId }, '')
    const onPop = () => setTripId(null)
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [tripId])

  const trip = tripId ? getTrip(tripId) : undefined
  const askTrip = askMe ? getTrip(askMe) : undefined

  return (
    <>
      {trip ? (
        <TripView trip={trip} onBack={() => history.back()} onSyncNow={(force) => syncTrip(trip.id, force)} />
      ) : (
        <TripList onOpen={setTripId} onJoined={onJoined} />
      )}
      {askTrip && (
        <Sheet open onClose={() => setAskMe(null)} title="¿Quién eres?">
          <p className="mb-4 text-sm text-slate-500">Elige tu nombre en «{askTrip.name}» para ver lo que debes o te deben.</p>
          <div className="grid gap-2">
            {askTrip.participants.map((p) => (
              <button
                key={p.id}
                className="card flex items-center gap-3 p-3 text-left font-medium hover:ring-2 hover:ring-brand-500/40"
                onClick={() => {
                  dispatch({ type: 'setMe', tripId: askTrip.id, participantId: p.id })
                  setAskMe(null)
                }}
              >
                <Avatar p={p} /> {p.name}
              </button>
            ))}
          </div>
        </Sheet>
      )}
    </>
  )
}
