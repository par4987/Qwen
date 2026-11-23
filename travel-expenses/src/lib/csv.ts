import { getCategory } from './categories'
import { computeShares, toBase } from './split'
import type { Trip } from './types'

function cell(v: string | number): string {
  const s = String(v)
  return /[";\n,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

const n = (cents: number) => (cents / 100).toFixed(2)

/** Exporta todos los movimientos a CSV (separador ';', apto para Excel en español). */
export function tripToCsv(trip: Trip): string {
  const people = trip.participants
  const header = [
    'Fecha', 'Tipo', 'Concepto', 'Categoría', 'Importe', 'Moneda', 'Tipo de cambio',
    `Importe (${trip.baseCurrency})`, 'Pagado por',
    ...people.map((p) => `Parte ${p.name} (${trip.baseCurrency})`), 'Notas',
  ]
  const kindLabel = { expense: 'Gasto', transfer: 'Reembolso', income: 'Ingreso' } as const
  const rows = [...trip.expenses]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((e) => {
      const shares = computeShares(e)
      const payers = Object.entries(e.paidBy)
        .filter(([, v]) => v > 0)
        .map(([id, v]) => `${people.find((p) => p.id === id)?.name ?? '?'} (${n(v)})`)
        .join(', ')
      return [
        e.date, kindLabel[e.kind], e.title, getCategory(e.category).label, n(e.amount), e.currency, e.rate,
        n(toBase(e.amount, e.rate)), payers,
        ...people.map((p) => n(toBase(shares[p.id] ?? 0, e.rate))), e.notes ?? '',
      ]
    })
  return '﻿' + [header, ...rows].map((r) => r.map(cell).join(';')).join('\n')
}

export function download(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
