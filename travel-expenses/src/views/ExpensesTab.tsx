import { Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Avatar, Button, Empty } from '../components/ui'
import { CATEGORIES, getCategory } from '../lib/categories'
import { formatMoney } from '../lib/money'
import { computeShares, toBase } from '../lib/split'
import type { Expense, Trip } from '../lib/types'

function dayLabel(iso: string) {
  const d = new Date(iso + 'T12:00:00')
  return d.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })
}

export function ExpensesTab({ trip, me, onOpen, onAdd }: {
  trip: Trip
  me?: string
  onOpen: (e: Expense) => void
  onAdd: () => void
}) {
  const [q, setQ] = useState('')
  const [cat, setCat] = useState<string>('')
  const [who, setWho] = useState<string>('')
  const people = new Map(trip.participants.map((p) => [p.id, p]))

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    return trip.expenses.filter(
      (e) =>
        (!s || e.title.toLowerCase().includes(s) || e.notes?.toLowerCase().includes(s)) &&
        (!cat || e.category === cat) &&
        (!who || e.paidBy[who] > 0 || e.split.values[who] > 0),
    )
  }, [trip.expenses, q, cat, who])

  const groups = useMemo(() => {
    const m = new Map<string, Expense[]>()
    for (const e of filtered) m.set(e.date, [...(m.get(e.date) ?? []), e])
    return [...m.entries()]
  }, [filtered])

  if (trip.expenses.length === 0)
    return (
      <Empty
        icon="🧾"
        title="Aún no hay gastos"
        text="Apunta el primero: el taxi del aeropuerto, el súper, la cena… Mochila calcula quién debe a quién."
        action={<Button onClick={onAdd}>Añadir gasto</Button>}
      />
    )

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="relative">
          <Search size={18} className="absolute top-1/2 left-3 -translate-y-1/2 text-slate-400" />
          <input className="input !pl-10" placeholder="Buscar gastos" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="flex gap-2">
          <select className="input !py-1.5 text-sm" value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Filtrar por categoría">
            <option value="">Todas las categorías</option>
            {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>)}
            <option value="transfer">💸 Reembolsos</option>
            <option value="income">💰 Ingresos</option>
          </select>
          <select className="input !py-1.5 text-sm" value={who} onChange={(e) => setWho(e.target.value)} aria-label="Filtrar por persona">
            <option value="">Todo el grupo</option>
            {trip.participants.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      </div>

      {groups.length === 0 && <p className="py-8 text-center text-sm text-slate-500">Nada coincide con el filtro.</p>}

      {groups.map(([date, items]) => {
        const dayTotal = items.reduce((a, e) => a + (e.kind === 'expense' ? toBase(e.amount, e.rate) : 0), 0)
        return (
          <section key={date}>
            <div className="mb-1.5 flex items-baseline justify-between px-1">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 first-letter:uppercase">{dayLabel(date)}</h3>
              {dayTotal > 0 && <span className="tabular text-xs text-slate-500">{formatMoney(dayTotal, trip.baseCurrency)}</span>}
            </div>
            <ul className="card divide-y divide-slate-100 overflow-hidden dark:divide-slate-800">
              {items.map((e) => {
                const c = getCategory(e.category)
                const payers = Object.keys(e.paidBy).filter((k) => e.paidBy[k] > 0)
                const payerName = payers.length > 1 ? `${payers.length} personas` : people.get(payers[0])?.name ?? '?'
                const shares = computeShares(e)
                let mine: number | null = null
                if (me && e.kind !== 'transfer') {
                  const v = toBase((e.paidBy[me] ?? 0) - (shares[me] ?? 0), e.rate) * (e.kind === 'income' ? -1 : 1)
                  mine = v
                }
                const sub =
                  e.kind === 'transfer'
                    ? `${payerName} → ${people.get(Object.keys(e.split.values)[0])?.name ?? '?'}`
                    : `${e.kind === 'income' ? 'Recibido por' : 'Pagado por'} ${payerName}`
                return (
                  <li key={e.id}>
                    <button onClick={() => onOpen(e)} className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800/60">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xl" style={{ background: c.color + '22' }}>
                        {c.emoji}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{e.title}</span>
                        <span className="flex items-center gap-1 truncate text-xs text-slate-500">
                          {payers.length === 1 && <Avatar p={people.get(payers[0])} size={14} />}
                          {sub}
                        </span>
                      </span>
                      <span className="text-right">
                        <span className={`tabular block font-bold ${e.kind === 'income' ? 'text-emerald-600' : e.kind === 'transfer' ? 'text-slate-500' : ''}`}>
                          {formatMoney(e.amount, e.currency)}
                        </span>
                        {e.currency !== trip.baseCurrency && (
                          <span className="tabular block text-[11px] text-slate-400">{formatMoney(toBase(e.amount, e.rate), trip.baseCurrency)}</span>
                        )}
                        {mine !== null && mine !== 0 && (
                          <span className={`tabular block text-[11px] font-medium ${mine > 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                            {mine > 0 ? 'te deben ' : 'debes '}
                            {formatMoney(Math.abs(mine), trip.baseCurrency)}
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
