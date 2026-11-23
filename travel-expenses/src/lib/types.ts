export type SplitMode = 'equal' | 'shares' | 'amounts' | 'percent'

export interface Participant {
  id: string
  name: string
  color: string
}

export interface Expense {
  id: string
  /** 'expense' = gasto normal, 'transfer' = reembolso entre viajeros, 'income' = ingreso común (devolución de fianza, etc.) */
  kind: 'expense' | 'transfer' | 'income'
  title: string
  /** Importe en céntimos de la moneda del gasto */
  amount: number
  currency: string
  /** Cuántas unidades de la moneda base vale 1 unidad de `currency` en el momento del gasto */
  rate: number
  category: string
  /** Fecha ISO (YYYY-MM-DD) */
  date: string
  /** Quién pagó y cuánto (céntimos en la moneda del gasto). */
  paidBy: Record<string, number>
  split: {
    mode: SplitMode
    /** equal: 1 = participa; shares: peso; amounts: céntimos; percent: porcentaje */
    values: Record<string, number>
  }
  notes?: string
  createdAt: number
  updatedAt: number
}

export interface Trip {
  id: string
  name: string
  emoji: string
  baseCurrency: string
  /** Presupuesto total en céntimos de la moneda base */
  budget?: number
  startDate?: string
  endDate?: string
  participants: Participant[]
  expenses: Expense[]
  /** Último tipo de cambio usado por moneda → se propone en nuevos gastos */
  rates: Record<string, number>
  createdAt: number
  updatedAt: number
}

export interface Transfer {
  from: string
  to: string
  /** Céntimos en moneda base */
  amount: number
}
