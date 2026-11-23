import { generateIdentity, type DeviceIdentity } from './crypto'

/**
 * La identidad del dispositivo se guarda en IndexedDB como CryptoKey NO exportable:
 * el navegador/WebView la usa para firmar, pero nadie (ni siquiera la app) puede leer la clave privada.
 */
const DB = 'mochila-keys'
const STORE = 'identity'

function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function tx<T>(db: IDBDatabase, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    const r = fn(db.transaction(STORE, mode).objectStore(STORE))
    r.onsuccess = () => resolve(r.result as T)
    r.onerror = () => reject(r.error)
  })
}

let cached: Promise<DeviceIdentity> | null = null

export function getIdentity(): Promise<DeviceIdentity> {
  if (!cached) {
    cached = (async () => {
      const db = await idb()
      const existing = await tx<DeviceIdentity | undefined>(db, 'readonly', (s) => s.get('me'))
      if (existing?.privateKey) return existing
      const id = await generateIdentity()
      await tx(db, 'readwrite', (s) => s.put(id, 'me'))
      return id
    })()
    cached.catch(() => (cached = null))
  }
  return cached
}
