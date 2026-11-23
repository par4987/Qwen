import { Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Avatar, Button, Field, Segmented, Sheet, cx, toast } from '../components/ui'
import { CATEGORIES, guessCategory } from '../lib/categories'
import { today, uid } from '../lib/id'
import { CURRENCIES, centsToInput, formatMoney, parseAmount } from '../lib/money'
import { computeShares, toBase, validateExpense } from '../lib/split'
import type { Expense, SplitMode, Trip } from '../lib/types'

type Kind = Expense['kind']

const SPLIT_LABELS: Record<SplitMode, string> = {
  equal: 'A partes iguales',
  shares: 'Por partes',
  amounts: 'Por importes',
  percent: 'Por %',
}

export function ExpenseForm({ trip, me, expense, preset, onSave, onDelete, onClose }: {
  trip: Trip
  me?: string
  expense?: Expense
  /** Valores iniciales para un gasto nuevo (p. ej. un reembolso sugerido) */
  preset?: Partial<Expense>
  onSave: (e: Expense) => void
  onDelete?: (e: Expense) => void
  onClose: () => void
}) {
  const people = trip.participants
  const base = expense ?? preset
  const defaultPayer = me && people.some((p) => p.id === me) ? me : people[0]?.id

  const [kind, setKind] = useState<Kind>(base?.kind ?? 'expense')
  const [title, setTitle] = useState(base?.title ?? '')
  const [amountStr, setAmountStr] = useState(base?.amount ? centsToInput(base.amount) : '')
  const [currency, setCurrency] = useState(base?.currency ?? trip.baseCurrency)
  const [rateStr, setRateStr] = useState(String(base?.rate ?? 1))
  const [category, setCategory] = useState(base?.category && !['transfer', 'income'].includes(base.category) ? base.category : 'other')
  const [categoryTouched, setCategoryTouched] = useState(!!expense)
  const [date, setDate] = useState(base?.date ?? today())
  const [notes, setNotes] = useState(base?.notes ?? '')

  const initialPayers = base?.paidBy ? Object.entries(base.paidBy).filter(([, v]) => v > 0) : []
  const [multiPayer, setMultiPayer] = useState(initialPayers.length > 1)
  const [payer, setPayer] = useState(initialPayers[0]?.[0] ?? defaultPayer)
  const [payerAmounts, setPayerAmounts] = useState<Record<string, string>>(
    Object.fromEntries(initialPayers.map(([id, v]) => [id, centsToInput(v)])),
  )

  const [mode, setMode] = useState<SplitMode>(base?.split?.mode ?? 'equal')
  const [included, setIncluded] = useState<Set<string>>(
    new Set(base?.split && base.split.mode === 'equal' ? Object.keys(base.split.values).filter((k) => base.split!.values[k] > 0) : people.map((p) => p.id)),
  )
  const [values, setValues] = useState<Record<string, string>>(() => {
    if (!base?.split || base.split.mode === 'equal') return {}
    return Object.fromEntries(
      Object.entries(base.split.values).map(([k, v]) => [k, base.split!.mode === 'amounts' ? centsToInput(v) : String(v)]),
    )
  })
  const [recipient, setRecipient] = useState(
    base?.kind === 'transfer' ? Object.keys(base.split?.values ?? {})[0] : people.find((p) => p.id !== defaultPayer)?.id,
  )

  const amount = parseAmount(amountStr)
  const rate = currency === trip.baseCurrency ? 1 : Number(rateStr.replace(',', '.'))

  const onCurrency = (c: string) => {
    setCurrency(c)
    setRateStr(String(c === trip.baseCurrency ? 1 : (trip.rates[c] ?? 1)))
  }

  const onTitle = (v: string) => {
    setTitle(v)
    if (!categoryTouched) {
      const g = guessCategory(v)
      if (g) setCategory(g)
    }
  }

  const draft: Expense = useMemo(() => {
    const now = Date.now()
    let paidBy: Record<string, number>
    if (kind === 'transfer' || !multiPayer) paidBy = payer ? { [payer]: amount } : {}
    else paidBy = Object.fromEntries(Object.entries(payerAmounts).map(([k, v]) => [k, parseAmount(v) || 0]).filter(([, v]) => (v as number) > 0))

    let split: Expense['split']
    if (kind === 'transfer') split = { mode: 'amounts', values: recipient ? { [recipient]: amount } : {} }
    else if (mode === 'equal') split = { mode, values: Object.fromEntries([...included].map((id) => [id, 1])) }
    else
      split = {
        mode,
        values: Object.fromEntries(
          Object.entries(values)
            .map(([k, v]) => [k, mode === 'amounts' ? parseAmount(v) || 0 : Number(v.replace(',', '.')) || 0])
            .filter(([, v]) => (v as number) > 0),
        ),
      }

    return {
      id: expense?.id ?? uid(),
      kind,
      title: kind === 'transfer' && !title.trim() ? 'Reembolso' : title,
      amount,
      currency,
      rate,
      category: kind === 'transfer' ? 'transfer' : kind === 'income' ? 'income' : category,
      date,
      paidBy,
      split,
      notes: notes.trim() || undefined,
      createdAt: expense?.createdAt ?? now,
      updatedAt: now,
    }
  }, [kind, multiPayer, payer, amount, payerAmounts, recipient, mode, included, values, expense, title, currency, rate, category, date, notes])

  const error = validateExpense(draft) ?? (kind === 'transfer' && payer === recipient ? 'Elige dos personas distintas.' : null)
  const preview = amount > 0 && !error ? computeShares(draft) : {}

  const save = () => {
    if (error) return toast(error)
    onSave(draft)
  }

  const splitSum =
    mode === 'amounts'
      ? Object.values(values).reduce((a, v) => a + (parseAmount(v) || 0), 0)
      : mode === 'percent'
        ? Object.values(values).reduce((a, v) => a + (Number(v.replace(',', '.')) || 0), 0)
        : 0
  const payerSum = Object.values(payerAmounts).reduce((a, v) => a + (parseAmount(v) || 0), 0)

  const titles: Record<Kind, string> = { expense: 'gasto', transfer: 'reembolso', income: 'ingreso' }

  return (
    <Sheet
      open
      onClose={onClose}
      title={`${expense ? 'Editar' : 'Nuevo'} ${titles[kind]}`}
      footer={
        <div className="flex gap-2">
          {expense && onDelete && (
            <Button
              variant="secondary"
              aria-label="Eliminar"
              onClick={() => confirm('¿Eliminar este movimiento?') && onDelete(expense)}
              className="!text-red-600"
            >
              <Trash2 size={18} />
            </Button>
          )}
          <Button className="flex-1" onClick={save}>
            Guardar
          </Button>
        </div>
      }
    >
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <Segmented<Kind>
          value={kind}
          onChange={setKind}
          options={[
            { value: 'expense', label: 'Gasto' },
            { value: 'transfer', label: 'Reembolso' },
            { value: 'income', label: 'Ingreso' },
          ]}
        />
        {kind === 'income' && (
          <p className="-mt-2 text-xs text-slate-500">Dinero que entra al grupo: devolución de una fianza, un premio, lo que sobra del bote…</p>
        )}

        {kind !== 'transfer' && (
          <Field label="Concepto">
            <input className="input" placeholder="Ej.: Cena en el puerto" value={title} onChange={(e) => onTitle(e.target.value)} autoFocus={!expense} />
          </Field>
        )}

        <div className="grid grid-cols-[1fr_auto] gap-2">
          <Field label="Importe">
            <input
              className="input tabular text-2xl font-bold"
              inputMode="decimal"
              placeholder="0,00"
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
              autoFocus={kind === 'transfer' && !expense}
            />
          </Field>
          <Field label="Moneda">
            <select className="input h-[52px]" value={currency} onChange={(e) => onCurrency(e.target.value)}>
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>{c.code}</option>
              ))}
            </select>
          </Field>
        </div>

        {currency !== trip.baseCurrency && (
          <Field
            label={`Tipo de cambio: 1 ${currency} = ? ${trip.baseCurrency}`}
            hint={amount > 0 && rate > 0 ? `≈ ${formatMoney(toBase(amount, rate), trip.baseCurrency)}` : 'Consulta el cambio que te aplicó tu banco o casa de cambio.'}
          >
            <input className="input tabular" inputMode="decimal" value={rateStr} onChange={(e) => setRateStr(e.target.value)} />
          </Field>
        )}

        {kind === 'transfer' ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Quién paga">
              <select className="input" value={payer} onChange={(e) => setPayer(e.target.value)}>
                {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
            <Field label="A quién">
              <select className="input" value={recipient} onChange={(e) => setRecipient(e.target.value)}>
                {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
          </div>
        ) : (
          <>
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{kind === 'income' ? 'Quién lo recibe' : 'Pagado por'}</span>
                {people.length > 1 && (
                  <button type="button" className="text-xs font-semibold text-brand-600" onClick={() => setMultiPayer(!multiPayer)}>
                    {multiPayer ? 'Una persona' : 'Varias personas'}
                  </button>
                )}
              </div>
              {!multiPayer ? (
                <div className="flex flex-wrap gap-2">
                  {people.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setPayer(p.id)}
                      className={cx(
                        'flex items-center gap-2 rounded-full border py-1 pr-3 pl-1 text-sm font-medium transition',
                        payer === p.id ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-700/30 dark:text-brand-100' : 'border-slate-200 dark:border-slate-700',
                      )}
                    >
                      <Avatar p={p} size={24} />
                      {p.name}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  {people.map((p) => (
                    <div key={p.id} className="flex items-center gap-2">
                      <Avatar p={p} size={28} />
                      <span className="flex-1 text-sm">{p.name}</span>
                      <input
                        className="input tabular !w-28 !py-1.5 text-right"
                        inputMode="decimal"
                        placeholder="0"
                        value={payerAmounts[p.id] ?? ''}
                        onChange={(e) => setPayerAmounts({ ...payerAmounts, [p.id]: e.target.value })}
                      />
                    </div>
                  ))}
                  <p className={cx('text-right text-xs tabular', payerSum === amount ? 'text-emerald-600' : 'text-amber-600')}>
                    {formatMoney(payerSum, currency)} de {formatMoney(amount || 0, currency)}
                  </p>
                </div>
              )}
            </div>

            <div>
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">{kind === 'income' ? 'Para quién' : 'Repartir'}</span>
              <div className="mb-3 flex flex-wrap gap-1.5">
                {(Object.keys(SPLIT_LABELS) as SplitMode[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    className={cx(
                      'rounded-full px-3 py-1 text-xs font-semibold transition',
                      mode === m ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
                    )}
                  >
                    {SPLIT_LABELS[m]}
                  </button>
                ))}
              </div>
              <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100 dark:divide-slate-800 dark:border-slate-800">
                {people.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 px-3 py-2">
                    {mode === 'equal' ? (
                      <input
                        type="checkbox"
                        className="h-5 w-5 accent-brand-600"
                        checked={included.has(p.id)}
                        onChange={(e) => {
                          const s = new Set(included)
                          if (e.target.checked) s.add(p.id)
                          else s.delete(p.id)
                          setIncluded(s)
                        }}
                        aria-label={p.name}
                      />
                    ) : null}
                    <Avatar p={p} size={28} />
                    <span className="flex-1 text-sm">{p.name}</span>
                    {mode !== 'equal' && (
                      <div className="flex items-center gap-1">
                        {mode === 'shares' && (
                          <button
                            type="button"
                            className="h-7 w-7 rounded-lg bg-slate-100 text-sm font-bold dark:bg-slate-800"
                            onClick={() => setValues({ ...values, [p.id]: String(Math.max(0, (Number(values[p.id]) || 0) - 1)) })}
                          >
                            −
                          </button>
                        )}
                        <input
                          className="input tabular !w-20 !px-2 !py-1.5 text-right"
                          inputMode="decimal"
                          placeholder="0"
                          value={values[p.id] ?? ''}
                          onChange={(e) => setValues({ ...values, [p.id]: e.target.value })}
                          aria-label={`${SPLIT_LABELS[mode]} ${p.name}`}
                        />
                        {mode === 'shares' && (
                          <button
                            type="button"
                            className="h-7 w-7 rounded-lg bg-slate-100 text-sm font-bold dark:bg-slate-800"
                            onClick={() => setValues({ ...values, [p.id]: String((Number(values[p.id]) || 0) + 1) })}
                          >
                            +
                          </button>
                        )}
                        {mode === 'percent' && <span className="text-sm text-slate-500">%</span>}
                      </div>
                    )}
                    <span className="tabular w-20 text-right text-sm font-medium text-slate-500">
                      {preview[p.id] ? formatMoney(preview[p.id], currency) : '—'}
                    </span>
                  </li>
                ))}
              </ul>
              {mode === 'amounts' && (
                <p className={cx('mt-1 text-right text-xs tabular', splitSum === amount ? 'text-emerald-600' : 'text-amber-600')}>
                  {formatMoney(splitSum, currency)} de {formatMoney(amount || 0, currency)} · faltan {formatMoney(amount - splitSum, currency)}
                </p>
              )}
              {mode === 'percent' && (
                <p className={cx('mt-1 text-right text-xs tabular', Math.abs(splitSum - 100) < 0.001 ? 'text-emerald-600' : 'text-amber-600')}>
                  {splitSum.toLocaleString('es')} % de 100 %
                </p>
              )}
              {mode === 'shares' && <p className="mt-1 text-xs text-slate-500">Ej.: una pareja = 2 partes, un niño = 0,5.</p>}
            </div>

            {kind === 'expense' && (
              <div>
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Categoría</span>
                <div className="grid grid-cols-4 gap-1.5">
                  {CATEGORIES.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setCategory(c.id)
                        setCategoryTouched(true)
                      }}
                      className={cx(
                        'flex flex-col items-center gap-0.5 rounded-xl py-2 text-[11px] font-medium transition',
                        category === c.id ? 'bg-brand-50 ring-2 ring-brand-500 dark:bg-brand-700/30' : 'bg-slate-50 dark:bg-slate-800',
                      )}
                    >
                      <span className="text-xl">{c.emoji}</span>
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Fecha">
            <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value || today())} />
          </Field>
          <Field label="Notas">
            <input className="input" placeholder="Opcional" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </div>
        {error && amount > 0 && <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">{error}</p>}
        <button type="submit" className="hidden" />
      </form>
    </Sheet>
  )
}
