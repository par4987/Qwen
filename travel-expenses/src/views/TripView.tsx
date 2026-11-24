import { BarChart3, ChevronLeft, CloudOff, Plus, Receipt, Scale, Settings, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { cx, toast } from '../components/ui'
import { today, uid } from '../lib/id'
import { formatMoney } from '../lib/money'
import { useStore } from '../lib/store'
import { computeBalances, totalSpent } from '../lib/split'
import type { Expense, Transfer, Trip } from '../lib/types'
import { BalancesTab } from './BalancesTab'
import { ExpenseForm } from './ExpenseForm'
import { ExpensesTab } from './ExpensesTab'
import { SettingsTab } from './SettingsTab'
import { StatsTab } from './StatsTab'

type Tab = 'expenses' | 'balances' | 'stats' | 'settings'

export function TripView({ trip, onBack, onSyncNow }: { trip: Trip; onBack: () => void; onSyncNow: (force?: boolean) => Promise<void> }) {
  const { dispatch, me } = useStore()
  const myId = me[trip.id]
  const [tab, setTab] = useState<Tab>('expenses')
  const [editing, setEditing] = useState<{ expense?: Expense; preset?: Partial<Expense> } | null>(null)

  const total = totalSpent(trip)
  const myBalance = myId ? computeBalances(trip).find((b) => b.participantId === myId)?.net : undefined

  const settle = (t: Transfer) =>
    setEditing({
      preset: {
        kind: 'transfer',
        title: 'Reembolso',
        amount: t.amount,
        currency: trip.baseCurrency,
        rate: 1,
        date: today(),
        paidBy: { [t.from]: t.amount },
        split: { mode: 'amounts', values: { [t.to]: t.amount } },
      },
    })

  const tabs: { id: Tab; label: string; icon: typeof Receipt }[] = [
    { id: 'expenses', label: 'Gastos', icon: Receipt },
    { id: 'balances', label: 'Saldos', icon: Scale },
    { id: 'stats', label: 'Resumen', icon: BarChart3 },
    { id: 'settings', label: 'Ajustes', icon: Settings },
  ]

  return (
    <div className="mx-auto min-h-dvh max-w-2xl pb-28">
      <header className="bg-gradient-to-br from-brand-600 to-brand-700 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-4 text-white shadow-md sm:rounded-b-3xl">
        <div className="flex items-center gap-2">
          <button onClick={onBack} className="-ml-2 rounded-full p-2 hover:bg-white/10" aria-label="Volver a mis viajes">
            <ChevronLeft size={22} />
          </button>
          <span className="text-2xl">{trip.emoji}</span>
          <h1 className="min-w-0 flex-1 truncate text-lg font-bold">{trip.name}</h1>
          {trip.sync && (
            <span
              className="flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-semibold"
              title={trip.sync.lastError ?? 'Grupo cifrado de extremo a extremo'}
            >
              {trip.sync.revoked ? <CloudOff size={12} /> : <ShieldCheck size={12} />}
              {trip.sync.revoked ? 'Sin acceso' : trip.sync.lastError ? 'Pendiente' : 'Cifrado'}
            </span>
          )}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-white/10 px-3 py-2">
            <p className="text-xs text-white/70">Gasto del grupo</p>
            <p className="tabular text-xl font-bold">{formatMoney(total, trip.baseCurrency)}</p>
          </div>
          <button
            className="rounded-2xl bg-white/10 px-3 py-2 text-left"
            onClick={() => (myBalance === undefined ? setTab('settings') : setTab('balances'))}
          >
            <p className="text-xs text-white/70">{myBalance === undefined ? 'Tu saldo' : myBalance >= 0 ? 'Te deben' : 'Debes'}</p>
            <p className="tabular text-xl font-bold">
              {myBalance === undefined ? <span className="text-sm font-medium">Elige quién eres →</span> : formatMoney(Math.abs(myBalance), trip.baseCurrency)}
            </p>
          </button>
        </div>
      </header>

      <nav className="sticky top-0 z-20 border-b border-slate-200 bg-slate-50/90 px-2 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
        <div className="flex">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={cx(
                'flex flex-1 flex-col items-center gap-0.5 border-b-2 py-2 text-xs font-semibold transition',
                tab === id ? 'border-brand-600 text-brand-700 dark:text-brand-500' : 'border-transparent text-slate-500',
              )}
            >
              <Icon size={18} />
              {label}
            </button>
          ))}
        </div>
      </nav>

      <main className="px-4 pt-4">
        {tab === 'expenses' && <ExpensesTab trip={trip} me={myId} onOpen={(e) => setEditing({ expense: e })} onAdd={() => setEditing({})} />}
        {tab === 'balances' && <BalancesTab trip={trip} me={myId} onSettle={settle} />}
        {tab === 'stats' && <StatsTab trip={trip} me={myId} />}
        {tab === 'settings' && <SettingsTab trip={trip} onDeleted={onBack} onSyncNow={onSyncNow} />}
      </main>

      {tab !== 'settings' && (
        <button
          onClick={() => setEditing({})}
          className="fixed right-5 bottom-[max(1.25rem,env(safe-area-inset-bottom))] z-30 flex items-center gap-2 rounded-full bg-brand-600 py-3.5 pr-5 pl-4 font-semibold text-white shadow-lg shadow-brand-600/30 transition hover:bg-brand-700 active:scale-95 sm:right-[calc(50%-20rem)]"
        >
          <Plus size={22} /> Gasto
        </button>
      )}

      {editing && (
        <ExpenseForm
          trip={trip}
          me={myId}
          expense={editing.expense}
          preset={editing.preset}
          onClose={() => setEditing(null)}
          onSave={(e) => {
            dispatch({ type: 'upsertExpense', tripId: trip.id, expense: editing.expense ? e : { ...e, id: e.id || uid() } })
            toast(editing.expense ? 'Movimiento actualizado' : e.kind === 'transfer' ? 'Reembolso registrado' : 'Gasto añadido')
            setEditing(null)
          }}
          onDelete={(e) => {
            dispatch({ type: 'deleteExpense', tripId: trip.id, expenseId: e.id })
            toast('Movimiento eliminado')
            setEditing(null)
          }}
        />
      )}
    </div>
  )
}
