export interface Category {
  id: string
  label: string
  emoji: string
  color: string
}

export const CATEGORIES: Category[] = [
  { id: 'food', label: 'Comida', emoji: '🍽️', color: '#f97316' },
  { id: 'drinks', label: 'Bebidas', emoji: '🍹', color: '#ec4899' },
  { id: 'lodging', label: 'Alojamiento', emoji: '🏨', color: '#8b5cf6' },
  { id: 'transport', label: 'Transporte', emoji: '🚕', color: '#3b82f6' },
  { id: 'flights', label: 'Vuelos', emoji: '✈️', color: '#0ea5e9' },
  { id: 'fuel', label: 'Combustible', emoji: '⛽', color: '#64748b' },
  { id: 'activities', label: 'Actividades', emoji: '🎟️', color: '#10b981' },
  { id: 'groceries', label: 'Supermercado', emoji: '🛒', color: '#84cc16' },
  { id: 'shopping', label: 'Compras', emoji: '🛍️', color: '#eab308' },
  { id: 'health', label: 'Salud', emoji: '💊', color: '#ef4444' },
  { id: 'fees', label: 'Comisiones', emoji: '🏦', color: '#78716c' },
  { id: 'other', label: 'Otros', emoji: '📦', color: '#94a3b8' },
]

export const TRANSFER_CATEGORY: Category = { id: 'transfer', label: 'Reembolso', emoji: '💸', color: '#14b8a6' }
export const INCOME_CATEGORY: Category = { id: 'income', label: 'Ingreso', emoji: '💰', color: '#22c55e' }

export function getCategory(id: string): Category {
  if (id === 'transfer') return TRANSFER_CATEGORY
  if (id === 'income') return INCOME_CATEGORY
  return CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[CATEGORIES.length - 1]
}

/** Sugiere una categoría a partir del concepto escrito. */
const KEYWORDS: [string, RegExp][] = [
  ['lodging', /hotel|hostal|airbnb|apartamento|alojamiento|camping|booking|albergue|caba[ñn]a/i],
  ['flights', /vuelo|avi[oó]n|ryanair|iberia|vueling|aerol[ií]nea|easyjet|latam/i],
  ['transport', /taxi|uber|cabify|bus|metro|tren|renfe|ferry|barco|parking|peaje|alquiler coche|tuk/i],
  ['fuel', /gasolina|gasoil|di[eé]sel|combustible|nafta/i],
  ['groceries', /s[uú]per|mercadona|carrefour|lidl|aldi|mercado|compra/i],
  ['drinks', /cerveza|copa|bar\b|vino|caf[eé]|cocktail|c[oó]ctel|birra/i],
  ['food', /cena|comida|almuerzo|desayuno|restaurante|tapas|pizza|burger|helado|brunch/i],
  ['activities', /museo|entrada|tour|excursi[oó]n|concierto|parque|ticket|visita|clase|buceo|surf/i],
  ['health', /farmacia|m[eé]dico|seguro|hospital/i],
  ['shopping', /regalo|souvenir|ropa|tienda/i],
  ['fees', /comisi[oó]n|cajero|atm|banco/i],
]

export function guessCategory(title: string): string | null {
  for (const [id, re] of KEYWORDS) if (re.test(title)) return id
  return null
}

export const PARTICIPANT_COLORS = [
  '#0d9488', '#f59e0b', '#6366f1', '#ec4899', '#10b981', '#ef4444',
  '#8b5cf6', '#0ea5e9', '#f97316', '#84cc16', '#14b8a6', '#a855f7',
]

export const TRIP_EMOJIS = ['🧳', '🏖️', '🏔️', '🌴', '🗽', '🏕️', '🚐', '⛷️', '🗼', '🎒', '🚢', '🌍']
