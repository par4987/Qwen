import { allocate } from './money'
import type { Expense, Transfer, Trip } from './types'

/** Importe de un gasto convertido a céntimos de la moneda base. */
export function toBase(cents: number, rate: number): number {
  return Math.round(cents * rate)
}

/** Cuánto le corresponde a cada participante del gasto, en céntimos de la moneda del gasto. */
export function computeShares(e: Pick<Expense, 'amount' | 'split'>): Record<string, number> {
  const { mode, values } = e.split
  switch (mode) {
    case 'equal':
      return allocate(e.amount, Object.fromEntries(Object.entries(values).filter(([, v]) => v > 0).map(([k]) => [k, 1])))
    case 'shares':
    case 'percent':
      return allocate(e.amount, values)
    case 'amounts': {
      const out: Record<string, number> = {}
      for (const [k, v] of Object.entries(values)) if (v) out[k] = v
      return out
    }
  }
}

/** Valida un gasto y devuelve un mensaje de error en español, o null si es correcto. */
export function validateExpense(e: Pick<Expense, 'amount' | 'split' | 'paidBy' | 'title' | 'rate'>): string | null {
  if (!e.title.trim()) return 'Ponle un concepto al gasto.'
  if (!Number.isFinite(e.amount) || e.amount <= 0) return 'El importe debe ser mayor que cero.'
  if (!Number.isFinite(e.rate) || e.rate <= 0) return 'El tipo de cambio debe ser mayor que cero.'
  const paid = Object.values(e.paidBy).reduce((a, b) => a + b, 0)
  if (paid !== e.amount) return 'La suma de lo pagado no coincide con el importe.'
  const active = Object.values(e.split.values).filter((v) => v > 0)
  if (active.length === 0) return 'Elige al menos una persona para repartir.'
  if (e.split.mode === 'amounts') {
    const sum = Object.values(e.split.values).reduce((a, b) => a + b, 0)
    if (sum !== e.amount) return 'La suma de los importes no coincide con el total.'
  }
  if (e.split.mode === 'percent') {
    const sum = Object.values(e.split.values).reduce((a, b) => a + b, 0)
    if (Math.abs(sum - 100) > 0.001) return 'Los porcentajes deben sumar 100 %.'
  }
  return null
}

export interface Balance {
  participantId: string
  /** Lo que ha pagado (moneda base, céntimos) */
  paid: number
  /** Lo que le corresponde por consumo (moneda base, céntimos) */
  share: number
  /** paid - share: positivo = le deben, negativo = debe */
  net: number
}

/**
 * Calcula el balance de cada viajero en moneda base.
 * - expense: los pagadores adelantan dinero, los beneficiarios consumen.
 * - transfer: `paidBy` entrega dinero a quien aparece en `split` (reembolso).
 * - income: un ingreso común lo recibe `paidBy` y pertenece a los de `split` (lo inverso de un gasto).
 */
export function computeBalances(trip: Trip): Balance[] {
  const map = new Map<string, Balance>()
  for (const p of trip.participants) map.set(p.id, { participantId: p.id, paid: 0, share: 0, net: 0 })
  const get = (id: string) => {
    let b = map.get(id)
    if (!b) {
      b = { participantId: id, paid: 0, share: 0, net: 0 }
      map.set(id, b)
    }
    return b
  }

  for (const e of trip.expenses) {
    const sign = e.kind === 'income' ? -1 : 1
    const baseTotal = toBase(e.amount, e.rate)
    const paidBase = allocate(baseTotal, e.paidBy)
    for (const [id, v] of Object.entries(paidBase)) get(id).paid += sign * v
    const shares = computeShares(e)
    const shareBase = allocate(baseTotal, shares)
    for (const [id, v] of Object.entries(shareBase)) {
      if (e.kind === 'transfer') get(id).paid -= v
      else get(id).share += sign * v
    }
  }
  for (const b of map.values()) b.net = b.paid - b.share
  return [...map.values()]
}

/** Propone el mínimo (aprox.) de transferencias para saldar todas las deudas. */
export function settleUp(balances: Pick<Balance, 'participantId' | 'net'>[]): Transfer[] {
  const creditors = balances.filter((b) => b.net > 0).map((b) => ({ id: b.participantId, amt: b.net }))
  const debtors = balances.filter((b) => b.net < 0).map((b) => ({ id: b.participantId, amt: -b.net }))
  const transfers: Transfer[] = []
  // Primero emparejar deudas idénticas (una sola transferencia cada una)
  for (const d of debtors) {
    const c = creditors.find((c) => c.amt === d.amt && c.amt > 0)
    if (c && d.amt > 0) {
      transfers.push({ from: d.id, to: c.id, amount: d.amt })
      c.amt = 0
      d.amt = 0
    }
  }
  // Después, voraz: mayor deudor paga al mayor acreedor
  for (;;) {
    creditors.sort((a, b) => b.amt - a.amt)
    debtors.sort((a, b) => b.amt - a.amt)
    const c = creditors[0]
    const d = debtors[0]
    if (!c || !d || c.amt <= 0 || d.amt <= 0) break
    const amount = Math.min(c.amt, d.amt)
    transfers.push({ from: d.id, to: c.id, amount })
    c.amt -= amount
    d.amt -= amount
  }
  return transfers
}

export function totalSpent(trip: Trip): number {
  return trip.expenses.reduce((acc, e) => {
    if (e.kind === 'expense') return acc + toBase(e.amount, e.rate)
    if (e.kind === 'income') return acc - toBase(e.amount, e.rate)
    return acc
  }, 0)
}
