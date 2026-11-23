import { Avatar, Empty } from '../components/ui'
import { getCategory } from '../lib/categories'
import { formatMoney } from '../lib/money'
import { computeBalances, toBase, totalSpent } from '../lib/split'
import type { Trip } from '../lib/types'

function daysBetween(a: string, b: string) {
  return Math.round((new Date(b + 'T12:00:00').getTime() - new Date(a + 'T12:00:00').getTime()) / 86400000) + 1
}

export function StatsTab({ trip, me }: { trip: Trip; me?: string }) {
  const cur = trip.baseCurrency
  const spending = trip.expenses.filter((e) => e.kind === 'expense')
  if (spending.length === 0) return <Empty icon="📊" title="Sin estadísticas todavía" text="Registra algunos gastos para ver en qué se va el dinero." />

  const total = totalSpent(trip)
  const byCat = new Map<string, number>()
  const byDay = new Map<string, number>()
  for (const e of spending) {
    const v = toBase(e.amount, e.rate)
    byCat.set(e.category, (byCat.get(e.category) ?? 0) + v)
    byDay.set(e.date, (byDay.get(e.date) ?? 0) + v)
  }
  const cats = [...byCat.entries()].sort((a, b) => b[1] - a[1])
  const catMax = cats[0]?.[1] ?? 1
  const days = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  const dayMax = Math.max(...days.map((d) => d[1]), 1)

  const dates = trip.expenses.map((e) => e.date).sort()
  const start = trip.startDate ?? dates[0]
  const end = trip.endDate ?? dates[dates.length - 1]
  const nDays = Math.max(1, daysBetween(start, end))
  const balances = computeBalances(trip)
  const people = new Map(trip.participants.map((p) => [p.id, p]))
  const myShare = me ? balances.find((b) => b.participantId === me)?.share : undefined
  const budgetPct = trip.budget ? Math.min(100, (total / trip.budget) * 100) : 0

  // Donut por categorías
  let acc = 0
  const R = 60
  const C = 2 * Math.PI * R
  const arcs = cats.map(([id, v]) => {
    const frac = v / total
    const a = { id, dash: frac * C, offset: -acc * C, color: getCategory(id).color }
    acc += frac
    return a
  })

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Gasto total" value={formatMoney(total, cur)} />
        <Stat label="Media por día" value={formatMoney(Math.round(total / nDays), cur)} sub={`${nDays} día${nDays === 1 ? '' : 's'}`} />
        <Stat label="Media por persona" value={formatMoney(Math.round(total / Math.max(1, trip.participants.length)), cur)} />
        {myShare !== undefined ? <Stat label="Tu gasto" value={formatMoney(myShare, cur)} sub="lo que has consumido" /> : <Stat label="Movimientos" value={String(trip.expenses.length)} />}
      </div>

      {trip.budget && (
        <section className="card p-4">
          <div className="mb-2 flex items-baseline justify-between">
            <h3 className="text-sm font-bold">Presupuesto</h3>
            <span className="tabular text-sm text-slate-500">
              {formatMoney(total, cur)} / {formatMoney(trip.budget, cur)}
            </span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div
              className={`h-full rounded-full ${budgetPct >= 100 ? 'bg-rose-500' : budgetPct > 80 ? 'bg-amber-500' : 'bg-brand-500'}`}
              style={{ width: `${budgetPct}%` }}
            />
          </div>
          <p className="mt-1.5 text-xs text-slate-500">
            {total <= trip.budget ? `Quedan ${formatMoney(trip.budget - total, cur)}` : `Te has pasado ${formatMoney(total - trip.budget, cur)}`}
          </p>
        </section>
      )}

      <section className="card p-4">
        <h3 className="mb-3 text-sm font-bold">Por categoría</h3>
        <div className="flex flex-col items-center gap-4 sm:flex-row">
          <svg viewBox="0 0 160 160" className="h-36 w-36 shrink-0 -rotate-90" role="img" aria-label="Gasto por categoría">
            <circle cx="80" cy="80" r={R} fill="none" stroke="currentColor" strokeWidth="22" className="text-slate-100 dark:text-slate-800" />
            {arcs.map((a) => (
              <circle key={a.id} cx="80" cy="80" r={R} fill="none" stroke={a.color} strokeWidth="22" strokeDasharray={`${a.dash} ${C - a.dash}`} strokeDashoffset={a.offset} />
            ))}
          </svg>
          <ul className="w-full space-y-2">
            {cats.map(([id, v]) => {
              const c = getCategory(id)
              return (
                <li key={id}>
                  <div className="flex items-center gap-2 text-sm">
                    <span>{c.emoji}</span>
                    <span className="flex-1">{c.label}</span>
                    <span className="tabular font-semibold">{formatMoney(v, cur)}</span>
                    <span className="tabular w-10 text-right text-xs text-slate-500">{Math.round((v / total) * 100)}%</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800">
                    <div className="h-full rounded-full" style={{ width: `${(v / catMax) * 100}%`, background: c.color }} />
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      </section>

      <section className="card p-4">
        <h3 className="mb-3 text-sm font-bold">Por día</h3>
        <div className="flex h-32 items-end gap-1 overflow-x-auto pb-1">
          {days.map(([d, v]) => (
            <div key={d} className="flex min-w-[22px] max-w-12 flex-1 flex-col items-center gap-1" title={`${d}: ${formatMoney(v, cur)}`}>
              <div className="w-full rounded-t-md bg-brand-500" style={{ height: `${Math.max(4, (v / dayMax) * 100)}px` }} />
              <span className="text-[10px] text-slate-500">{new Date(d + 'T12:00:00').getDate()}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="card p-4">
        <h3 className="mb-3 text-sm font-bold">Consumo de cada viajero</h3>
        <ul className="space-y-2">
          {[...balances].filter((b) => people.has(b.participantId)).sort((a, b) => b.share - a.share).map((b) => (
            <li key={b.participantId} className="flex items-center gap-2 text-sm">
              <Avatar p={people.get(b.participantId)} size={24} />
              <span className="flex-1">{people.get(b.participantId)?.name}</span>
              <span className="tabular font-semibold">{formatMoney(b.share, cur)}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="tabular mt-0.5 text-lg font-bold">{value}</p>
      {sub && <p className="text-[11px] text-slate-400">{sub}</p>}
    </div>
  )
}
