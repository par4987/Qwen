import { mkdtempSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Server } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mergeTrips } from '../share'
import type { Trip } from '../types'
import { createGroup, decodeInvite, deleteGroup, encodeInvite, pull, push, SyncError } from './client'
import { deriveGroupKeys, generateIdentity, open, seal } from './crypto'

// Con RELAY_URL las pruebas se ejecutan contra un servidor externo (p. ej. el Worker de Cloudflare en `wrangler dev`);
// sin ella se arranca el servidor Node de relay/ en un puerto libre.
const external = process.env.RELAY_URL
const dataDir = mkdtempSync(join(tmpdir(), 'mochila-relay-'))
let server: Server
let relay = external ?? ''

beforeAll(async () => {
  if (external) return
  process.env.DATA_DIR = dataDir
  // @ts-expect-error módulo JS sin tipos
  const mod = await import('../../../relay/server.mjs')
  server = await mod.start({ port: 0, host: '127.0.0.1' })
  relay = `http://127.0.0.1:${(server.address() as { port: number }).port}`
})
afterAll(() => server?.close())

function trip(p: Partial<Trip> = {}): Trip {
  return {
    id: 'trip1', name: 'Roma', emoji: '🧳', baseCurrency: 'EUR',
    participants: [{ id: 'a', name: 'Ana', color: '#000' }, { id: 'b', name: 'Bea', color: '#111' }],
    expenses: [], rates: {}, createdAt: 1, updatedAt: 1, metaUpdatedAt: 1, ...p,
  }
}

const exp = (id: string, updatedAt: number, title = id) => ({
  id, kind: 'expense' as const, title, amount: 1000, currency: 'EUR', rate: 1, category: 'food', date: '2026-01-01',
  paidBy: { a: 1000 }, split: { mode: 'equal' as const, values: { a: 1, b: 1 } }, createdAt: updatedAt, updatedAt,
})

describe('cripto', () => {
  it('cifra, firma y detecta manipulaciones', async () => {
    const id = await generateIdentity()
    const keys = await deriveGroupKeys('A'.repeat(43), 'g'.repeat(22))
    const blob = await seal('hola', 'g'.repeat(22), keys, id)
    expect(await open(blob, 'g'.repeat(22), id.deviceId, keys)).toBe('hola')
    // Otro grupo / otro dispositivo / bit cambiado → error
    await expect(open(blob, 'h'.repeat(22), id.deviceId, keys)).rejects.toThrow()
    const other = await generateIdentity()
    await expect(open(blob, 'g'.repeat(22), other.deviceId, keys)).rejects.toThrow()
    const flipped = blob.slice(0, 30) + (blob[30] === 'A' ? 'B' : 'A') + blob.slice(31)
    await expect(open(flipped, 'g'.repeat(22), id.deviceId, keys)).rejects.toThrow()
    // Clave equivocada
    const wrong = await deriveGroupKeys('B'.repeat(43), 'g'.repeat(22))
    await expect(open(blob, 'g'.repeat(22), id.deviceId, wrong)).rejects.toThrow()
  })

  it('la clave privada no es exportable', async () => {
    const id = await generateIdentity()
    expect(id.privateKey.extractable).toBe(false)
  })
})

describe('invitaciones', () => {
  it('ida y vuelta, y rechaza basura o http remoto', () => {
    const inv = { relay: 'https://relay.example.com', groupId: 'x'.repeat(22), secret: 'A'.repeat(43), name: 'Roma' }
    expect(decodeInvite(`Únete: https://relay.example.com/join#${encodeInvite(inv)}`)).toEqual(inv)
    expect(decodeInvite('MOCHILA1.basura')).toBeNull()
    expect(decodeInvite(encodeInvite({ ...inv, relay: 'http://evil.example.com' }))).toBeNull()
  })
})

describe('sincronización extremo a extremo con el servidor', () => {
  it('dos dispositivos convergen y el servidor sólo ve datos cifrados', async () => {
    const ana = await generateIdentity()
    const bea = await generateIdentity()
    const g = await createGroup(relay)
    const cfg = { ...g, cursor: 0 }

    const tA = trip({ expenses: [exp('e1', 10, 'Pizza secreta')] })
    await push(tA, cfg, ana)

    // Bea se une con la invitación
    const inv = decodeInvite(encodeInvite({ ...g, name: 'Roma' }))!
    const first = await pull({ ...inv, cursor: 0 }, bea)
    expect(first.trips).toHaveLength(1)
    expect(first.trips[0].expenses[0].title).toBe('Pizza secreta')

    // Bea añade un gasto y borra el de Ana
    let tB = first.trips[0]
    tB = { ...tB, expenses: [exp('e2', 20)], deleted: { e1: 15 }, updatedAt: 20 }
    await push(tB, { ...cfg, cursor: first.cursor }, bea)

    const back = await pull({ ...cfg, cursor: 1 }, ana)
    expect(back.trips).toHaveLength(1)
    const merged = mergeTrips(tA, back.trips[0])
    expect(merged.expenses.map((e) => e.id)).toEqual(['e2'])

    if (external) return
    // El servidor no contiene nada legible
    const raw = await readFile(join(dataDir, `${g.groupId}.json`), 'utf8')
    expect(raw).not.toContain('Pizza')
    expect(raw).not.toContain('Roma')
    expect(raw).not.toContain(g.secret)
  })

  it.skipIf(external)('rechaza accesos sin el secreto y blobs inyectados', async () => {
    const ana = await generateIdentity()
    const g = await createGroup(relay)
    await push(trip(), { ...g, cursor: 0 }, ana)

    // Secreto equivocado → 401
    const bad = { ...g, secret: 'B'.repeat(43), cursor: 0 }
    await expect(pull(bad, ana)).rejects.toMatchObject({ status: 401 })

    // Alguien con acceso al disco del servidor inyecta un blob: se ignora
    const path = join(dataDir, `${g.groupId}.json`)
    const data = JSON.parse(await readFile(path, 'utf8'))
    data.version += 1
    data.devices['x'.repeat(22)] = { version: data.version, blob: data.devices[ana.deviceId].blob }
    await writeFile(path, JSON.stringify(data))
    const bea = await generateIdentity()
    const r = await pull({ ...g, cursor: 0 }, bea)
    expect(r.trips).toHaveLength(1)
    expect(r.rejected).toBe(1)
  })

  it('rechaza accesos sin el secreto', async () => {
    const ana = await generateIdentity()
    const g = await createGroup(relay)
    await push(trip(), { ...g, cursor: 0 }, ana)
    await expect(pull({ ...g, secret: 'B'.repeat(43), cursor: 0 }, ana)).rejects.toMatchObject({ status: 401 })
    const res = await fetch(`${relay}/v1/g/${g.groupId}`)
    expect(res.status).toBe(401)
  })

  it('no se puede recrear un grupo existente ni usarlo tras borrarlo', async () => {
    const ana = await generateIdentity()
    const g = await createGroup(relay)
    const res = await fetch(`${relay}/v1/g/${g.groupId}`, { method: 'PUT', body: JSON.stringify({ tokenHash: 'A'.repeat(43) }) })
    expect(res.status).toBe(409)
    await deleteGroup({ ...g, cursor: 0 })
    await expect(push(trip(), { ...g, cursor: 0 }, ana)).rejects.toBeInstanceOf(SyncError)
  })
})
