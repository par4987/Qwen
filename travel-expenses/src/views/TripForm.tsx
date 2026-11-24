import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Avatar, Button, Field, cx, toast } from '../components/ui'
import { PARTICIPANT_COLORS, TRIP_EMOJIS } from '../lib/categories'
import { uid } from '../lib/id'
import { CURRENCIES, centsToInput, parseAmount } from '../lib/money'
import type { Participant, Trip } from '../lib/types'

export function newTrip(): Trip {
  const now = Date.now()
  return {
    id: uid(),
    name: '',
    emoji: TRIP_EMOJIS[0],
    baseCurrency: 'EUR',
    participants: [],
    expenses: [],
    rates: {},
    createdAt: now,
    updatedAt: now,
  }
}

export function TripForm({ initial, onSubmit, submitLabel }: {
  initial: Trip
  onSubmit: (t: Trip, myName?: string) => void
  submitLabel: string
}) {
  const isNew = initial.participants.length === 0
  const [t, setT] = useState<Trip>(initial)
  const [budget, setBudget] = useState(initial.budget ? centsToInput(initial.budget) : '')
  const [newName, setNewName] = useState('')
  const [myName, setMyName] = useState('')

  const used = new Set(t.expenses.flatMap((e) => [...Object.keys(e.paidBy), ...Object.keys(e.split.values)]))

  const addParticipant = () => {
    const name = newName.trim()
    if (!name) return
    if (t.participants.some((p) => p.name.toLowerCase() === name.toLowerCase())) return toast('Ese nombre ya está en el viaje')
    const color = PARTICIPANT_COLORS[(t.participants.length + (isNew && myName ? 1 : 0)) % PARTICIPANT_COLORS.length]
    setT({ ...t, participants: [...t.participants, { id: uid(), name, color }] })
    setNewName('')
  }

  const updateP = (id: string, patch: Partial<Participant>) =>
    setT({ ...t, participants: t.participants.map((p) => (p.id === id ? { ...p, ...patch } : p)) })

  const submit = () => {
    if (!t.name.trim()) return toast('Ponle nombre al viaje')
    let participants = t.participants
    if (isNew && myName.trim()) {
      participants = [{ id: uid(), name: myName.trim(), color: PARTICIPANT_COLORS[0] }, ...participants].map((p, i) => ({
        ...p,
        color: PARTICIPANT_COLORS[i % PARTICIPANT_COLORS.length],
      }))
    }
    if (participants.length < 1) return toast('Añade al menos un viajero')
    if (participants.some((p) => !p.name.trim())) return toast('Hay un viajero sin nombre')
    const b = parseAmount(budget)
    onSubmit({ ...t, name: t.name.trim(), participants, budget: b > 0 ? b : undefined }, isNew ? myName.trim() : undefined)
  }

  return (
    <form
      className="space-y-5"
      id="trip-form"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <div>
        <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Icono</span>
        <div className="flex flex-wrap gap-1.5">
          {TRIP_EMOJIS.map((em) => (
            <button
              type="button"
              key={em}
              onClick={() => setT({ ...t, emoji: em })}
              className={cx('h-10 w-10 rounded-xl text-xl transition', t.emoji === em ? 'bg-brand-100 ring-2 ring-brand-500 dark:bg-brand-700/40' : 'bg-slate-100 dark:bg-slate-800')}
            >
              {em}
            </button>
          ))}
        </div>
      </div>

      <Field label="Nombre del viaje">
        <input className="input" placeholder="Ej.: Ruta por Portugal" value={t.name} onChange={(e) => setT({ ...t, name: e.target.value })} autoFocus={isNew} />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Moneda principal">
          <select
            className="input"
            value={t.baseCurrency}
            onChange={(e) => setT({ ...t, baseCurrency: e.target.value })}
            disabled={t.expenses.length > 0}
            title={t.expenses.length > 0 ? 'No se puede cambiar cuando ya hay gastos' : undefined}
          >
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>{c.code} · {c.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Presupuesto (opcional)">
          <input className="input" inputMode="decimal" placeholder="0" value={budget} onChange={(e) => setBudget(e.target.value)} />
        </Field>
        <Field label="Desde">
          <input className="input" type="date" value={t.startDate ?? ''} onChange={(e) => setT({ ...t, startDate: e.target.value || undefined })} />
        </Field>
        <Field label="Hasta">
          <input className="input" type="date" value={t.endDate ?? ''} onChange={(e) => setT({ ...t, endDate: e.target.value || undefined })} />
        </Field>
      </div>

      <div>
        <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Viajeros</span>
        {isNew && (
          <input className="input mb-2" placeholder="Tu nombre" value={myName} onChange={(e) => setMyName(e.target.value)} />
        )}
        <ul className="space-y-2">
          {t.participants.map((p) => (
            <li key={p.id} className="flex items-center gap-2">
              <Avatar p={p} />
              <input className="input flex-1 !py-2" value={p.name} onChange={(e) => updateP(p.id, { name: e.target.value })} aria-label="Nombre" />
              <input type="color" value={p.color} onChange={(e) => updateP(p.id, { color: e.target.value })} className="h-9 w-9 cursor-pointer rounded-lg border-0 bg-transparent" aria-label="Color" />
              <button
                type="button"
                disabled={used.has(p.id)}
                title={used.has(p.id) ? 'Tiene gastos asociados' : 'Quitar'}
                onClick={() => setT({ ...t, participants: t.participants.filter((x) => x.id !== p.id) })}
                className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30 dark:hover:bg-red-950"
              >
                <Trash2 size={18} />
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex gap-2">
          <input
            className="input flex-1"
            placeholder={isNew ? 'Nombre de otro viajero' : 'Añadir viajero'}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addParticipant()
              }
            }}
          />
          <Button type="button" variant="secondary" onClick={addParticipant} aria-label="Añadir viajero">
            <Plus size={18} />
          </Button>
        </div>
      </div>

      <Button type="submit" className="w-full">{submitLabel}</Button>
    </form>
  )
}
