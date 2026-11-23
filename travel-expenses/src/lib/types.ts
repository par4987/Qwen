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
  /** Gastos eliminados (id → momento del borrado), para que el borrado se propague al sincronizar */
  deleted?: Record<string, number>
  /** Momento de la última edición de los datos del viaje (nombre, viajeros, presupuesto…) */
  metaUpdatedAt?: number
  /** Configuración del grupo compartido. Sólo existe en este dispositivo: nunca se incluye al compartir. */
  sync?: SyncConfig
  createdAt: number
  updatedAt: number
}

export interface SyncConfig {
  /** Servidor de retransmisión, p. ej. https://relay.ejemplo.com */
  relay: string
  /** Identificador público del grupo en el servidor */
  groupId: string
  /** Secreto del grupo (32 bytes en base64url). De él se derivan la clave de cifrado y el token de acceso. */
  secret: string
  /** Cursor: última versión recibida del servidor */
  cursor: number
  lastSyncAt?: number
  lastError?: string
  /** Huella y fecha de la última instantánea subida, para no subir dos veces lo mismo */
  pushedHash?: string
  pushedAt?: number
  /** El servidor rechazó el acceso (grupo renovado o eliminado): se deja de sincronizar */
  revoked?: boolean
}

export interface Transfer {
  from: string
  to: string
  /** Céntimos en moneda base */
  amount: number
}
