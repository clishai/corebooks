import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { buildApp } from '../../src/api/server.js'
import { Ledger } from '../../src/core/engine/ledger.js'
import { createTestDb, clearTestDb, destroyTestDb } from '../helpers/testDb.js'
import type { FastifyInstance } from 'fastify'

let dbPath: string
let app: FastifyInstance

// Each test gets a fresh app (and thus a fresh Ledger) so posted entries
// from one test never bleed into the next.
beforeAll(() => {
  dbPath = createTestDb()
  process.env['DATABASE_URL'] = `file:${dbPath}`
})

afterAll(async () => {
  await destroyTestDb(dbPath)
})

beforeEach(async () => {
  await clearTestDb()
  app = buildApp({ ledger: new Ledger(), chartOfAccounts: [] }, { logger: false })
  await app.ready()
})

afterEach(async () => {
  await app.close()
})

async function createCash() {
  return app.inject({
    method: 'POST',
    url: '/accounts',
    payload: { number: '1000', name: 'Cash', type: 'Asset', normalBalance: 'debit', isContra: false },
  })
}

describe('GET /accounts', () => {
  it('returns an empty array when no accounts exist', async () => {
    const res = await app.inject({ method: 'GET', url: '/accounts' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual([])
  })
})

describe('POST /accounts', () => {
  it('creates an account and returns 201 with the new record', async () => {
    const res = await createCash()
    expect(res.statusCode).toBe(201)
    expect(res.json().id).toBeTruthy()
    expect(res.json().number).toBe('1000')
    expect(res.json().name).toBe('Cash')
    expect(res.json().type).toBe('Asset')
  })

  it('created account is visible in subsequent GET', async () => {
    await createCash()
    const res = await app.inject({ method: 'GET', url: '/accounts' })
    expect(res.json()).toHaveLength(1)
  })

  it('returns accounts sorted by number', async () => {
    await app.inject({ method: 'POST', url: '/accounts', payload: { number: '4000', name: 'Revenue', type: 'Revenue', normalBalance: 'credit', isContra: false } })
    await createCash()
    const res = await app.inject({ method: 'GET', url: '/accounts' })
    expect(res.json().map((a: { number: string }) => a.number)).toEqual(['1000', '4000'])
  })

  it('returns an error on duplicate account number', async () => {
    await createCash()
    const res = await createCash()
    expect(res.statusCode).toBeGreaterThanOrEqual(400)
  })
})

describe('PATCH /accounts/:id', () => {
  it('updates the account name and returns the updated record', async () => {
    const created = await createCash()
    const id = created.json().id
    const res = await app.inject({ method: 'PATCH', url: `/accounts/${id}`, payload: { name: 'Petty Cash' } })
    expect(res.statusCode).toBe(200)
    expect(res.json().name).toBe('Petty Cash')
    expect(res.json().number).toBe('1000')
  })

  it('returns 404 for an unknown account id', async () => {
    const res = await app.inject({ method: 'PATCH', url: '/accounts/no-such-id', payload: { name: 'X' } })
    expect(res.statusCode).toBe(404)
  })
})
