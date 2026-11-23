# Mochila · Gastos de viaje compartidos

App web (PWA, instalable en el móvil y usable sin conexión) para apuntar los gastos de un viaje y repartirlos entre los viajeros.

## Qué tomamos de las apps de referencia (Play Store)

| App | Lo que gusta | Lo que se critica | Cómo lo resuelve Mochila |
|---|---|---|---|
| **Splitwise** | Repartos flexibles, simplificación de deudas | Límite diario de gastos en la versión gratuita, anuncios, funciones de pago | Sin límites, sin anuncios, todo incluido: reparto igual / por partes / por importes / por % y "mínimo de pagos" |
| **Tricount** | Gratis, sin registro, multimoneda | Sin exportación ni visión global | Exportación CSV (Excel) y JSON, pestaña *Resumen* con categorías, días, presupuesto y consumo por persona |
| **Settle Up** | Funciona sin conexión, varios pagadores | Anuncios y premium | PWA offline-first; gastos con varios pagadores; sin premium |
| **Splid** | Grupo compartido con un código, sin cuentas | Menos funciones avanzadas | Compartir con un enlace (sin cuentas) y fusión automática de cambios |

## Funcionalidades

- **Viajes ilimitados** con icono, fechas, moneda principal y presupuesto opcional.
- **Gastos, reembolsos e ingresos comunes** (p. ej. devolución de una fianza).
- **Multimoneda**: cada gasto guarda su moneda y el tipo de cambio aplicado; se recuerda el último cambio usado.
- **Repartos**: a partes iguales (eligiendo quién participa), por partes/pesos, por importes exactos o por porcentaje, con vista previa de lo que paga cada uno. Redondeo sin perder céntimos.
- **Varios pagadores** en un mismo gasto.
- **Categoría automática** según el concepto ("taxi" → Transporte, "cena" → Comida…).
- **Saldos** de cada viajero y **liquidación con el mínimo de transferencias**; un toque en *Pagado* registra el reembolso.
- **"¿Quién eres?"** por dispositivo: muestra "debes / te deben" en cada gasto y en la cabecera.
- **Resumen**: total, media por día y por persona, presupuesto restante, gráfico por categorías y por día.
- **Compartir sin servidor**: el viaje entero viaja comprimido en el fragmento `#` del enlace (no llega a ningún servidor). Al abrir un enlace de un viaje que ya tienes, se fusionan los cambios (gana la edición más reciente de cada gasto).
- **Exportar** a CSV (separador `;`, abre directamente en Excel en español) y copia de seguridad JSON (importable).
- **Búsqueda y filtros** por texto, categoría y persona.
- Modo oscuro automático, diseño móvil primero, funciona sin conexión.

## Desarrollo

```bash
cd travel-expenses
npm install
npm run dev      # servidor de desarrollo
npm test         # pruebas de la lógica de repartos y liquidación
npm run build    # build de producción en dist/ (rutas relativas, se puede alojar en cualquier hosting estático)
```

Stack: React 19 + TypeScript + Vite + Tailwind CSS 4. Los datos se guardan en `localStorage`.

### Estructura

```
src/lib/      lógica pura (dinero, repartos, saldos, compartir, CSV) y store
src/views/    pantallas: lista de viajes, viaje (gastos, saldos, resumen, ajustes), formularios
src/components/ui.tsx  componentes base
public/       manifest, icono y service worker
```

## Siguientes pasos posibles

- Sincronización en tiempo real con un backend (p. ej. Supabase/Firebase) manteniendo el modo sin registro.
- Foto del ticket (IndexedDB) y OCR para rellenar el importe.
- Tipos de cambio automáticos desde una API.
- Gastos recurrentes y recordatorios de pago.
