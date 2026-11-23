import { describe, expect, it } from 'vitest'
import { allocate, parseAmount } from './money'
import { computeBalances, computeShares, settleUp, totalSpent, validateExpense } from './split'
import { mergeTrips, decodeTrip, encodeTrip } from './share'
import type { Expense, Trip } from './types'

const people = ['ana', 'ben', 'cris'].map((id) => ({ id, name: id, color: '#000' }))

function exp(p: Partial<Expense>): Expense {
  return {
    id: Math.random().toString(36).slice(2),
    kind: 'expense',
    title: 'x',
    amount: 0,
    currency: 'EUR',
    rate: 1,
    category: 'other',
    date: '2026-01-01',
    paidBy: {},
    split: { mode: 'equal', values: { ana: 1, ben: 1, cris: 1 } },
    createdAt: 0,
    updatedAt: 0,
    ...p,
  }
}

function trip(expenses: Expense[]): Trip {
  return { id: 't', name: 'T', emoji: '🧳', baseCurrency: 'EUR', participants: people, expenses, rates: {}, createdAt: 0, updatedAt: 0 }
}

describe('parseAmount', () => {
  it('acepta coma y punto decimal', () => {
    expect(parseAmount('12,50')).toBe(1250)
    expect(parseAmount('12.5')).toBe(1250)
    expect(parseAmount('1.234,56')).toBe(123456)
    expect(parseAmount('1,234.56')).toBe(123456)
    expect(parseAmount('')).toBe(0)
    expect(parseAmount('abc')).toBeNaN()
  })
})

describe('allocate', () => {
  it('no pierde céntimos', () => {
    const r = allocate(1000, { a: 1, b: 1, c: 1 })
    expect(Object.values(r).reduce((x, y) => x + y, 0)).toBe(1000)
    expect(Object.values(r).sort()).toEqual([333, 333, 334])
  })
  it('respeta pesos', () => {
    expect(allocate(900, { a: 2, b: 1 })).toEqual({ a: 600, b: 300 })
  })
})

describe('computeShares', () => {
  it('reparto por porcentaje', () => {
    expect(computeShares({ amount: 1000, split: { mode: 'percent', values: { ana: 50, ben: 30, cris: 20 } } })).toEqual({ ana: 500, ben: 300, cris: 200 })
  })
  it('reparto igual excluye a quien tiene 0', () => {
    expect(computeShares({ amount: 1000, split: { mode: 'equal', values: { ana: 1, ben: 1, cris: 0 } } })).toEqual({ ana: 500, ben: 500 })
  })
})

describe('balances y liquidación', () => {
  it('gasto simple', () => {
    const t = trip([exp({ amount: 3000, paidBy: { ana: 3000 } })])
    const b = computeBalances(t)
    expect(b.find((x) => x.participantId === 'ana')!.net).toBe(2000)
    expect(b.find((x) => x.participantId === 'ben')!.net).toBe(-1000)
    const s = settleUp(b)
    expect(s).toHaveLength(2)
    expect(s.every((x) => x.to === 'ana' && x.amount === 1000)).toBe(true)
  })

  it('los reembolsos saldan la deuda', () => {
    const t = trip([
      exp({ amount: 3000, paidBy: { ana: 3000 } }),
      exp({ kind: 'transfer', category: 'transfer', amount: 1000, paidBy: { ben: 1000 }, split: { mode: 'amounts', values: { ana: 1000 } } }),
    ])
    const b = computeBalances(t)
    expect(b.find((x) => x.participantId === 'ben')!.net).toBe(0)
    expect(b.find((x) => x.participantId === 'ana')!.net).toBe(1000)
    expect(totalSpent(t)).toBe(3000)
  })

  it('ingresos comunes', () => {
    const t = trip([exp({ kind: 'income', amount: 3000, paidBy: { ana: 3000 } })])
    const b = computeBalances(t)
    expect(b.find((x) => x.participantId === 'ana')!.net).toBe(-2000)
    expect(b.find((x) => x.participantId === 'cris')!.net).toBe(1000)
  })

  it('multimoneda convierte a la base', () => {
    const t = trip([exp({ amount: 10000, currency: 'USD', rate: 0.9, paidBy: { ben: 10000 }, split: { mode: 'equal', values: { ana: 1, ben: 1 } } })])
    const b = computeBalances(t)
    expect(b.find((x) => x.participantId === 'ana')!.net).toBe(-4500)
    expect(b.find((x) => x.participantId === 'ben')!.net).toBe(4500)
  })

  it('los balances siempre suman cero', () => {
    const t = trip([
      exp({ amount: 1001, paidBy: { ana: 500, ben: 501 } }),
      exp({ amount: 777, currency: 'THB', rate: 0.027, paidBy: { cris: 777 }, split: { mode: 'shares', values: { ana: 2, ben: 1, cris: 1 } } }),
    ])
    const b = computeBalances(t)
    expect(b.reduce((a, x) => a + x.net, 0)).toBe(0)
    const s = settleUp(b)
    const after = Object.fromEntries(b.map((x) => [x.participantId, x.net]))
    for (const tr of s) {
      after[tr.from] += tr.amount
      after[tr.to] -= tr.amount
    }
    expect(Object.values(after).every((v) => v === 0)).toBe(true)
  })
})

describe('validateExpense', () => {
  it('detecta errores', () => {
    expect(validateExpense(exp({ title: '', amount: 100, paidBy: { ana: 100 } }))).toMatch(/concepto/)
    expect(validateExpense(exp({ amount: 100, paidBy: { ana: 90 } }))).toMatch(/pagado/)
    expect(validateExpense(exp({ amount: 100, paidBy: { ana: 100 }, split: { mode: 'percent', values: { ana: 50 } } }))).toMatch(/100/)
    expect(validateExpense(exp({ amount: 100, paidBy: { ana: 100 } }))).toBeNull()
  })
})

describe('compartir', () => {
  it('codifica y decodifica', () => {
    const t = trip([exp({ amount: 100, paidBy: { ana: 100 } })])
    expect(decodeTrip(encodeTrip(t))).toEqual(t)
    expect(decodeTrip('basura')).toBeNull()
  })
  it('fusiona quedándose con lo más reciente', () => {
    const e1 = exp({ id: 'e1', title: 'viejo', updatedAt: 1 })
    const a = trip([e1])
    const b = trip([{ ...e1, title: 'nuevo', updatedAt: 2 }, exp({ id: 'e2' })])
    const m = mergeTrips(a, b)
    expect(m.expenses).toHaveLength(2)
    expect(m.expenses.find((e) => e.id === 'e1')!.title).toBe('nuevo')
  })
})
