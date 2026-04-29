import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { buildApp } from '../../src/api/server.js'
import { Ledger } from '../../src/core/engine/ledger.js'
import { createTestDb, clearTestDb, destroyTestDb } from '../helpers/testDb.js'
import type { FastifyInstance } from 'fastify'

let dbPath: string
let app: FastifyInstance
let cashId: string
let revenueId: string

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
  const cash = await app.inject({ method: 'POST', url: '/accounts', payload: { number: '1000', name: 'Cash', type: 'Asset', normalBalance: 'debit', isContra: false } })
  const revenue = await app.inject({ method: 'POST', url: '/accounts', payload: { number: '4000', name: 'Revenue', type: 'Revenue', normalBalance: 'credit', isContra: false } })
  cashId = cash.json().id
  revenueId = revenue.json().id
})

afterEach(async () => {
  await app.close()
})

async function postEntry(amount = 500) {
  const draft = await app.inject({
    method: 'POST', url: '/entries/draft',
    payload: {
      date: '2025-06-15',
      memo: 'Test sale',
      lines: [
        { accountId: cashId, amount, type: 'debit' },
        { accountId: revenueId, amount, type: 'credit' },
      ],
    },
  })
  return app.inject({ method: 'POST', url: '/entries/post', payload: { id: draft.json().id } })
}

describe('GET /reports/trial-balance', () => {
  it('returns zero totals and balanced:true with no entries', async () => {
    const res = await app.inject({ method: 'GET', url: '/reports/trial-balance' })
    expect(res.statusCode).toBe(200)
    expect(res.json().totalDebits).toBe(0)
    expect(res.json().totalCredits).toBe(0)
    expect(res.json().balanced).toBe(true)
  })

  it('reflects posted entry balances', async () => {
    await postEntry(500)
    const res = await app.inject({ method: 'GET', url: '/reports/trial-balance' })
    expect(res.json().totalDebits).toBe(500)
    expect(res.json().totalCredits).toBe(500)
    expect(res.json().balanced).toBe(true)
  })

  it('returns a row per account', async () => {
    const res = await app.inject({ method: 'GET', url: '/reports/trial-balance' })
    expect(res.json().rows).toHaveLength(2)
  })
})

describe('GET /reports/balance-sheet', () => {
  it('returns 400 when asOf is missing', async () => {
    const res = await app.inject({ method: 'GET', url: '/reports/balance-sheet' })
    expect(res.statusCode).toBe(400)
  })

  it('returns 400 for an invalid date', async () => {
    const res = await app.inject({ method: 'GET', url: '/reports/balance-sheet?asOf=not-a-date' })
    expect(res.statusCode).toBe(400)
  })

  it('returns zero balances and balanced:true with no entries', async () => {
    const res = await app.inject({ method: 'GET', url: '/reports/balance-sheet?asOf=2025-12-31' })
    expect(res.statusCode).toBe(200)
    expect(res.json().assets).toBe(0)
    expect(res.json().liabilities).toBe(0)
    expect(res.json().equity).toBe(0)
    expect(res.json().balanced).toBe(true)
  })

  it('reflects posted entries in balances', async () => {
    await postEntry(500)
    const res = await app.inject({ method: 'GET', url: '/reports/balance-sheet?asOf=2025-12-31' })
    // Cash debit 500 → assets = 500; Revenue credit 500 → equity = 500 (net income)
    expect(res.json().assets).toBe(500)
    expect(res.json().equity).toBe(500)
    expect(res.json().balanced).toBe(true)
  })

  it('excludes entries after the asOf date', async () => {
    await postEntry(500)
    const res = await app.inject({ method: 'GET', url: '/reports/balance-sheet?asOf=2025-01-01' })
    expect(res.json().assets).toBe(0)
  })
})

describe('GET /reports/income-statement', () => {
  it('returns 400 when from/to params are missing', async () => {
    const res = await app.inject({ method: 'GET', url: '/reports/income-statement' })
    expect(res.statusCode).toBe(400)
  })

  it('returns 400 when from is after to', async () => {
    const res = await app.inject({ method: 'GET', url: '/reports/income-statement?from=2025-12-31&to=2025-01-01' })
    expect(res.statusCode).toBe(400)
  })

  it('returns zero values with no entries', async () => {
    const res = await app.inject({ method: 'GET', url: '/reports/income-statement?from=2025-01-01&to=2025-12-31' })
    expect(res.statusCode).toBe(200)
    expect(res.json().revenue).toBe(0)
    expect(res.json().expenses).toBe(0)
    expect(res.json().netIncome).toBe(0)
  })

  it('reflects revenue from posted entries', async () => {
    await postEntry(500)
    const res = await app.inject({ method: 'GET', url: '/reports/income-statement?from=2025-01-01&to=2025-12-31' })
    expect(res.json().revenue).toBe(500)
    expect(res.json().expenses).toBe(0)
    expect(res.json().netIncome).toBe(500)
  })

  it('excludes entries outside the date range', async () => {
    await postEntry(500)
    const res = await app.inject({ method: 'GET', url: '/reports/income-statement?from=2024-01-01&to=2024-12-31' })
    expect(res.json().revenue).toBe(0)
  })
})
