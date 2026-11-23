import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, type ReactNode } from 'react'
import { mergeTrips } from './share'
import type { Expense, Trip } from './types'

const STORAGE_KEY = 'mochila.trips.v1'
const ME_KEY = 'mochila.me.v1'

interface State {
  trips: Trip[]
  /** Por dispositivo: qué viajero soy en cada viaje (no se comparte) */
  me: Record<string, string>
}

type Action =
  | { type: 'upsertTrip'; trip: Trip }
  | { type: 'deleteTrip'; id: string }
  | { type: 'upsertExpense'; tripId: string; expense: Expense }
  | { type: 'deleteExpense'; tripId: string; expenseId: string }
  | { type: 'importTrip'; trip: Trip }
  | { type: 'setMe'; tripId: string; participantId: string }

function touch(t: Trip): Trip {
  return { ...t, updatedAt: Date.now() }
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'upsertTrip': {
      const exists = state.trips.some((t) => t.id === action.trip.id)
      const trip = touch(action.trip)
      return { ...state, trips: exists ? state.trips.map((t) => (t.id === trip.id ? trip : t)) : [trip, ...state.trips] }
    }
    case 'deleteTrip': {
      const me = { ...state.me }
      delete me[action.id]
      return { trips: state.trips.filter((t) => t.id !== action.id), me }
    }
    case 'upsertExpense':
      return {
        ...state,
        trips: state.trips.map((t) => {
          if (t.id !== action.tripId) return t
          const e = action.expense
          const exists = t.expenses.some((x) => x.id === e.id)
          const expenses = exists ? t.expenses.map((x) => (x.id === e.id ? e : x)) : [e, ...t.expenses]
          expenses.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)
          const rates = e.currency !== t.baseCurrency ? { ...t.rates, [e.currency]: e.rate } : t.rates
          return touch({ ...t, expenses, rates })
        }),
      }
    case 'deleteExpense':
      return {
        ...state,
        trips: state.trips.map((t) =>
          t.id === action.tripId ? touch({ ...t, expenses: t.expenses.filter((e) => e.id !== action.expenseId) }) : t,
        ),
      }
    case 'importTrip': {
      const local = state.trips.find((t) => t.id === action.trip.id)
      if (!local) return { ...state, trips: [action.trip, ...state.trips] }
      const merged = mergeTrips(local, action.trip)
      return { ...state, trips: state.trips.map((t) => (t.id === merged.id ? merged : t)) }
    }
    case 'setMe':
      return { ...state, me: { ...state.me, [action.tripId]: action.participantId } }
  }
}

function load(): State {
  try {
    const trips = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as Trip[]
    const me = JSON.parse(localStorage.getItem(ME_KEY) ?? '{}') as Record<string, string>
    return { trips: Array.isArray(trips) ? trips : [], me: me && typeof me === 'object' ? me : {} }
  } catch {
    return { trips: [], me: {} }
  }
}

interface Store extends State {
  dispatch: (a: Action) => void
  getTrip: (id: string) => Trip | undefined
}

const Ctx = createContext<Store | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, load)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.trips))
      localStorage.setItem(ME_KEY, JSON.stringify(state.me))
    } catch {
      // almacenamiento lleno o bloqueado: la app sigue funcionando en memoria
    }
  }, [state])

  // Sincroniza entre pestañas abiertas
  useEffect(() => {
    const onStorage = (ev: StorageEvent) => {
      if (ev.key !== STORAGE_KEY || !ev.newValue) return
      try {
        for (const t of JSON.parse(ev.newValue) as Trip[]) dispatch({ type: 'importTrip', trip: t })
      } catch {
        /* ignorar */
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const getTrip = useCallback((id: string) => state.trips.find((t) => t.id === id), [state.trips])
  const value = useMemo(() => ({ ...state, dispatch, getTrip }), [state, getTrip])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useStore(): Store {
  const s = useContext(Ctx)
  if (!s) throw new Error('useStore fuera de StoreProvider')
  return s
}
