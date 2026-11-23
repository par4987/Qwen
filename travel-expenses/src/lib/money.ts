export const CURRENCIES: { code: string; name: string }[] = [
  { code: 'EUR', name: 'Euro' },
  { code: 'USD', name: 'Dólar estadounidense' },
  { code: 'GBP', name: 'Libra esterlina' },
  { code: 'MXN', name: 'Peso mexicano' },
  { code: 'ARS', name: 'Peso argentino' },
  { code: 'COP', name: 'Peso colombiano' },
  { code: 'CLP', name: 'Peso chileno' },
  { code: 'PEN', name: 'Sol peruano' },
  { code: 'BRL', name: 'Real brasileño' },
  { code: 'UYU', name: 'Peso uruguayo' },
  { code: 'CHF', name: 'Franco suizo' },
  { code: 'JPY', name: 'Yen japonés' },
  { code: 'CNY', name: 'Yuan chino' },
  { code: 'THB', name: 'Baht tailandés' },
  { code: 'VND', name: 'Dong vietnamita' },
  { code: 'IDR', name: 'Rupia indonesia' },
  { code: 'INR', name: 'Rupia india' },
  { code: 'KRW', name: 'Won surcoreano' },
  { code: 'AUD', name: 'Dólar australiano' },
  { code: 'CAD', name: 'Dólar canadiense' },
  { code: 'MAD', name: 'Dírham marroquí' },
  { code: 'TRY', name: 'Lira turca' },
  { code: 'SEK', name: 'Corona sueca' },
  { code: 'NOK', name: 'Corona noruega' },
  { code: 'DKK', name: 'Corona danesa' },
  { code: 'PLN', name: 'Esloti polaco' },
  { code: 'CZK', name: 'Corona checa' },
  { code: 'HUF', name: 'Florín húngaro' },
]

/** Convierte un texto introducido por el usuario ("12,50", "12.5", "1.234,56") a céntimos. */
export function parseAmount(input: string): number {
  let s = input.trim().replace(/\s/g, '')
  if (!s) return 0
  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')
  if (lastComma > -1 && lastDot > -1) {
    // El último separador es el decimal
    if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.')
    else s = s.replace(/,/g, '')
  } else if (lastComma > -1) {
    s = s.replace(',', '.')
  }
  const n = Number(s)
  if (!Number.isFinite(n)) return NaN
  return Math.round(n * 100)
}

export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2).replace(/\.00$/, '')
}

const fmtCache = new Map<string, Intl.NumberFormat>()

export function formatMoney(cents: number, currency: string): string {
  let f = fmtCache.get(currency)
  if (!f) {
    try {
      f = new Intl.NumberFormat('es', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 })
    } catch {
      f = new Intl.NumberFormat('es', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    }
    fmtCache.set(currency, f)
  }
  return f.format(cents / 100)
}

/** Reparte `total` céntimos según `weights` sin perder ni crear céntimos (método del mayor resto). */
export function allocate(total: number, weights: Record<string, number>): Record<string, number> {
  const ids = Object.keys(weights).filter((id) => weights[id] > 0)
  const out: Record<string, number> = {}
  const sum = ids.reduce((a, id) => a + weights[id], 0)
  if (sum <= 0 || ids.length === 0) return out
  const sign = total < 0 ? -1 : 1
  const abs = Math.abs(total)
  let assigned = 0
  const remainders: { id: string; r: number }[] = []
  for (const id of ids) {
    const exact = (abs * weights[id]) / sum
    const floor = Math.floor(exact)
    out[id] = floor
    assigned += floor
    remainders.push({ id, r: exact - floor })
  }
  remainders.sort((a, b) => b.r - a.r || a.id.localeCompare(b.id))
  for (let i = 0; i < abs - assigned; i++) out[remainders[i % remainders.length].id] += 1
  if (sign < 0) for (const id of ids) out[id] = -out[id]
  return out
}
