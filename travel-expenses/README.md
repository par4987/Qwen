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
- **App Android** (Capacitor): menú nativo de compartir, exportación a Drive/WhatsApp/email, botón atrás, enlaces `mochila://join`.
- **Grupos compartidos cifrados de extremo a extremo**: invitación por QR o enlace, sincronización automática entre móviles a través
  de un servidor que no puede leer nada, código de seguridad para verificar en persona y renovación de acceso para expulsar a alguien.
  Ver [SEGURIDAD.md](SEGURIDAD.md).

## App Android

Requisitos: Node 20+, JDK 21 y el SDK de Android (Android Studio o `cmdline-tools` con `platforms;android-36` y `build-tools;36.0.0`).

```bash
npm install
npm run android:apk        # → android/app/build/outputs/apk/debug/app-debug.apk
npm run android:open       # abre el proyecto en Android Studio
```

Para publicar en Google Play, crea una clave de firma y `android/keystore.properties` (no se sube al repositorio):

```bash
keytool -genkeypair -v -keystore android/mochila.jks -alias mochila -keyalg RSA -keysize 4096 -validity 10000
cat > android/keystore.properties <<'PROPS'
storeFile=mochila.jks
storePassword=…
keyAlias=mochila
keyPassword=…
PROPS
npm run android:release    # → app-release.aab (Play Store) y app-release.apk
```

## Servidor de sincronización (`relay/`)

Un único archivo sin dependencias (`relay/server.mjs`). Sólo almacena datos cifrados. Despliegue:

```bash
# Local (pruebas; desde el emulador de Android usa http://10.0.2.2:8787)
npm run relay

# Producción con Docker, detrás de un proxy HTTPS (Caddy, Nginx, Cloudflare…)
docker build -t mochila-relay relay
docker run -d -p 8787:8787 -v mochila-data:/data -e TRUST_PROXY=1 mochila-relay
```

En la app: *Ajustes del viaje → Grupo compartido cifrado → servidor* `https://tu-dominio`. Para que la app lo
proponga por defecto, compila con `VITE_RELAY_URL=https://tu-dominio npm run android:apk`. Opciones del servidor en
la cabecera de `relay/server.mjs` (límites, CORS, App Links con `ANDROID_PACKAGE` y `ANDROID_CERT_SHA256`).

## Desarrollo

```bash
cd travel-expenses
npm install
npm run dev      # servidor de desarrollo
npm test         # pruebas: repartos, liquidación, cifrado y sincronización contra el servidor real
npm run build    # build de producción en dist/ (rutas relativas, se puede alojar en cualquier hosting estático)
```

Stack: React 19 + TypeScript + Vite + Tailwind CSS 4 + Capacitor 8 (Android). Los datos se guardan en el dispositivo; la
sincronización usa WebCrypto (AES-256-GCM, HKDF, ECDSA P-256) sin librerías criptográficas externas.

### Estructura

```
src/lib/      lógica pura (dinero, repartos, saldos, compartir, CSV), store e integración Android (platform.ts)
src/lib/sync/ cifrado, identidad del dispositivo, cliente y motor de sincronización
src/views/    pantallas: lista de viajes, viaje (gastos, saldos, resumen, ajustes), formularios
src/components/ui.tsx  componentes base
public/       manifest, icono y service worker
android/      proyecto nativo Android (Capacitor)
relay/        servidor de sincronización cifrada (+ Dockerfile)
```

## Siguientes pasos posibles

- Notificaciones push cuando alguien añade un gasto (sin revelar el contenido al servicio de push).
- Escáner de QR dentro de la app (hoy se usa la cámara del sistema o se pega el código).
- Foto del ticket (IndexedDB) y OCR para rellenar el importe.
- Tipos de cambio automáticos desde una API.
- Gastos recurrentes y recordatorios de pago.
