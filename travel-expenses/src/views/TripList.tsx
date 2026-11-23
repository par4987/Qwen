import { ChevronRight, Plus, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { Avatar, Button, Empty, Sheet, toast } from '../components/ui'
import { formatMoney } from '../lib/money'
import { isTrip } from '../lib/share'
import { useStore } from '../lib/store'
import { computeBalances, totalSpent } from '../lib/split'
import type { Trip } from '../lib/types'
import { TripForm, newTrip } from './TripForm'

function dateRange(t: Trip) {
  const f = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('es', { day: 'numeric', month: 'short' })
  if (t.startDate && t.endDate) return `${f(t.startDate)} – ${f(t.endDate)}`
  if (t.startDate) return `Desde ${f(t.startDate)}`
  return `${t.expenses.length} movimiento${t.expenses.length === 1 ? '' : 's'}`
}

export function TripList({ onOpen }: { onOpen: (id: string) => void }) {
  const { trips, me, dispatch } = useStore()
  const [creating, setCreating] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const importFile = async (file: File) => {
    try {
      const data = JSON.parse(await file.text())
      if (!isTrip(data)) throw new Error()
      dispatch({ type: 'importTrip', trip: data })
      toast('Viaje importado')
      onOpen(data.id)
    } catch {
      toast('El archivo no es una copia válida de Mochila')
    }
  }

  return (
    <div className="mx-auto min-h-dvh max-w-2xl px-4 pt-[max(1.5rem,env(safe-area-inset-top))] pb-28">
      <header className="mb-6 flex items-center gap-3">
        <img src="./icon.svg" alt="" className="h-11 w-11" />
        <div className="flex-1">
          <h1 className="text-2xl font-extrabold tracking-tight">Mochila</h1>
          <p className="text-sm text-slate-500">Gastos de viaje compartidos</p>
        </div>
        <Button variant="ghost" className="!px-2.5" onClick={() => fileRef.current?.click()} title="Importar copia JSON">
          <Upload size={18} />
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) importFile(f)
            e.target.value = ''
          }}
        />
      </header>

      {trips.length === 0 ? (
        <div className="card">
          <Empty
            icon="🧳"
            title="¿A dónde vais?"
            text="Crea un viaje, añade a tus compañeros y apuntad los gastos. Sin registro, sin anuncios y sin límite de gastos."
            action={
              <Button onClick={() => setCreating(true)}>
                <Plus size={18} /> Crear mi primer viaje
              </Button>
            }
          />
          <ul className="grid gap-3 border-t border-slate-100 p-5 text-sm text-slate-600 sm:grid-cols-2 dark:border-slate-800 dark:text-slate-300">
            <li>💱 Gastos en cualquier moneda</li>
            <li>➗ Reparto igual, por partes, % o importes</li>
            <li>🤝 Mínimo de pagos para saldar deudas</li>
            <li>📶 Funciona sin conexión</li>
            <li>🔗 Comparte con un enlace, sin cuentas</li>
            <li>📤 Exporta a Excel</li>
          </ul>
        </div>
      ) : (
        <ul className="space-y-3">
          {trips.map((t) => {
            const myId = me[t.id]
            const bal = myId ? computeBalances(t).find((b) => b.participantId === myId)?.net : undefined
            return (
              <li key={t.id}>
                <button onClick={() => onOpen(t.id)} className="card flex w-full items-center gap-3 p-4 text-left transition hover:shadow-md active:scale-[0.99]">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-2xl dark:bg-brand-700/30">{t.emoji}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold">{t.name}</span>
                    <span className="block text-xs text-slate-500">{dateRange(t)}</span>
                    <span className="mt-1.5 flex -space-x-1.5">
                      {t.participants.slice(0, 6).map((p) => (
                        <span key={p.id} className="rounded-full ring-2 ring-white dark:ring-slate-900">
                          <Avatar p={p} size={20} />
                        </span>
                      ))}
                      {t.participants.length > 6 && <span className="pl-3 text-xs text-slate-500">+{t.participants.length - 6}</span>}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="tabular block font-bold">{formatMoney(totalSpent(t), t.baseCurrency)}</span>
                    {bal !== undefined && bal !== 0 && (
                      <span className={`tabular block text-xs font-medium ${bal > 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                        {bal > 0 ? 'Te deben ' : 'Debes '}
                        {formatMoney(Math.abs(bal), t.baseCurrency)}
                      </span>
                    )}
                  </span>
                  <ChevronRight size={18} className="text-slate-300" />
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {trips.length > 0 && (
        <button
          onClick={() => setCreating(true)}
          className="fixed right-5 bottom-[max(1.25rem,env(safe-area-inset-bottom))] z-30 flex items-center gap-2 rounded-full bg-brand-600 py-3.5 pr-5 pl-4 font-semibold text-white shadow-lg shadow-brand-600/30 transition hover:bg-brand-700 active:scale-95 sm:right-[calc(50%-20rem)]"
        >
          <Plus size={22} /> Nuevo viaje
        </button>
      )}

      <Sheet open={creating} onClose={() => setCreating(false)} title="Nuevo viaje">
        <TripForm
          initial={newTrip()}
          submitLabel="Crear viaje"
          onSubmit={(t, myName) => {
            dispatch({ type: 'upsertTrip', trip: t })
            const mine = myName ? t.participants.find((p) => p.name === myName) : undefined
            if (mine) dispatch({ type: 'setMe', tripId: t.id, participantId: mine.id })
            setCreating(false)
            onOpen(t.id)
          }}
        />
      </Sheet>
    </div>
  )
}
