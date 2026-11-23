import { useEffect, useState } from 'react'
import { Avatar, Sheet, toast } from './components/ui'
import { decodeTrip } from './lib/share'
import { useStore } from './lib/store'
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

  // Importar un viaje recibido por enlace (#import=...)
  useEffect(() => {
    const handle = () => {
      const m = window.location.hash.match(/^#import=(.+)$/)
      if (!m) return
      history.replaceState(null, '', window.location.pathname + window.location.search)
      const trip = decodeTrip(m[1])
      if (!trip) return toast('El enlace no es válido o está incompleto')
      const existed = !!getTrip(trip.id)
      dispatch({ type: 'importTrip', trip })
      toast(existed ? 'Cambios del grupo fusionados' : `Te has unido a «${trip.name}»`)
      setTripId(trip.id)
      if (!me[trip.id]) setAskMe(trip.id)
    }
    handle()
    window.addEventListener('hashchange', handle)
    return () => window.removeEventListener('hashchange', handle)
  }, [getTrip, dispatch, me])

  useEffect(() => {
    try {
      if (tripId) localStorage.setItem(LAST_KEY, tripId)
      else localStorage.removeItem(LAST_KEY)
    } catch {
      /* ignorar */
    }
  }, [tripId])

  // Botón "atrás" del móvil vuelve a la lista
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
      {trip ? <TripView trip={trip} onBack={() => history.back()} /> : <TripList onOpen={setTripId} />}
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
