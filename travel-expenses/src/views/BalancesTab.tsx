import { ArrowRight, Check, Copy } from 'lucide-react'
import { Avatar, Button, Empty } from '../components/ui'
import { shareText } from '../lib/platform'
import { formatMoney } from '../lib/money'
import { computeBalances, settleUp } from '../lib/split'
import type { Transfer, Trip } from '../lib/types'

export function BalancesTab({ trip, me, onSettle }: { trip: Trip; me?: string; onSettle: (t: Transfer) => void }) {
  const balances = computeBalances(trip).filter((b) => trip.participants.some((p) => p.id === b.participantId))
  const transfers = settleUp(balances)
  const people = new Map(trip.participants.map((p) => [p.id, p]))
  const max = Math.max(1, ...balances.map((b) => Math.abs(b.net)))
  const cur = trip.baseCurrency

  const summary = () => {
    const lines = [`${trip.emoji} ${trip.name} — cómo quedamos`, '']
    if (transfers.length === 0) lines.push('¡Estamos en paz! Nadie debe nada.')
    for (const t of transfers) lines.push(`• ${people.get(t.from)?.name} → ${people.get(t.to)?.name}: ${formatMoney(t.amount, cur)}`)
    lines.push('', 'Calculado con Mochila')
    return lines.join('\n')
  }

  const copy = () => shareText({ title: 'Cómo quedamos', text: summary() })

  if (trip.expenses.length === 0) return <Empty icon="⚖️" title="Sin movimientos" text="Cuando registres gastos, aquí verás cuánto ha puesto cada uno y quién debe a quién." />

  return (
    <div className="space-y-6">
      <section className="card p-4">
        <h3 className="mb-3 text-sm font-bold">Saldo de cada viajero</h3>
        <ul className="space-y-3">
          {[...balances].sort((a, b) => b.net - a.net).map((b) => {
            const p = people.get(b.participantId)
            const pct = (Math.abs(b.net) / max) * 50
            return (
              <li key={b.participantId}>
                <div className="flex items-center gap-2">
                  <Avatar p={p} size={28} />
                  <span className="flex-1 text-sm font-medium">
                    {p?.name}
                    {b.participantId === me && <span className="ml-1 text-xs text-slate-400">(tú)</span>}
                  </span>
                  <span className={`tabular text-sm font-bold ${b.net > 0 ? 'text-emerald-600' : b.net < 0 ? 'text-rose-500' : 'text-slate-400'}`}>
                    {b.net > 0 ? '+' : ''}
                    {formatMoney(b.net, cur)}
                  </span>
                </div>
                <div className="relative mt-1.5 h-2 rounded-full bg-slate-100 dark:bg-slate-800">
                  <div className="absolute top-0 left-1/2 h-2 w-px bg-slate-300 dark:bg-slate-600" />
                  <div
                    className={`absolute top-0 h-2 rounded-full ${b.net >= 0 ? 'bg-emerald-500' : 'bg-rose-400'}`}
                    style={b.net >= 0 ? { left: '50%', width: `${pct}%` } : { right: '50%', width: `${pct}%` }}
                  />
                </div>
                <p className="mt-1 text-[11px] text-slate-500 tabular">
                  Pagó {formatMoney(b.paid, cur)} · Su parte {formatMoney(b.share, cur)}
                </p>
              </li>
            )
          })}
        </ul>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between px-1">
          <h3 className="text-sm font-bold">Cómo saldar cuentas</h3>
          <Button variant="ghost" className="!px-2 !py-1 text-xs" onClick={copy}>
            <Copy size={14} /> Compartir resumen
          </Button>
        </div>
        {transfers.length === 0 ? (
          <div className="card flex items-center gap-3 p-4 text-sm">
            <span className="text-2xl">🎉</span> ¡Estáis en paz! Nadie debe nada.
          </div>
        ) : (
          <ul className="space-y-2">
            {transfers.map((t, i) => (
              <li key={i} className={`card flex items-center gap-3 p-3 ${t.from === me || t.to === me ? 'ring-2 ring-brand-500/40' : ''}`}>
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <Avatar p={people.get(t.from)} size={32} />
                  <div className="min-w-0">
                    <p className="truncate text-sm">
                      <b>{people.get(t.from)?.name}</b> <ArrowRight size={12} className="inline text-slate-400" /> <b>{people.get(t.to)?.name}</b>
                    </p>
                    <p className="tabular text-lg font-bold">{formatMoney(t.amount, cur)}</p>
                  </div>
                </div>
                <Button variant="secondary" className="!px-3 !py-2 text-xs" onClick={() => onSettle(t)}>
                  <Check size={14} /> Pagado
                </Button>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 px-1 text-xs text-slate-500">
          Mochila calcula el menor número de pagos posible. Al marcar uno como pagado se registra un reembolso.
        </p>
      </section>
    </div>
  )
}
