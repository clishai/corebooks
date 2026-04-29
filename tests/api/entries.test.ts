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
  // Seed the two accounts used in most tests
  const cash = await app.inject({ method: 'POST', url: '/accounts', payload: { number: '1000', name: 'Cash', type: 'Asset', normalBalance: 'debit', isContra: false } })
  const revenue = await app.inject({ method: 'POST', url: '/accounts', payload: { number: '4000', name: 'Revenue', type: 'Revenue', normalBalance: 'credit', isContra: false } })
  cashId = cash.json().id
  revenueId = revenue.json().id
})

afterEach(async () => {
  await app.close()
})

function balancedDraftPayload(amount = 500) {
  return {
    date: '2025-06-15',
    memo: 'Test sale',
    lines: [
      { accountId: cashId, amount, type: 'debit' },
      { accountId: revenueId, amount, type: 'credit' },
    ],
  }
}

describe('GET /entries', () => {
  it('returns an empty array when no entries have been posted', async () => {
    const res = await app.inject({ method: 'GET', url: '/entries' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual([])
  })
})

describe('GET /entries/drafts', () => {
  it('returns an empty array when no drafts exist', async () => {
    const res = await app.inject({ method: 'GET', url: '/entries/drafts' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual([])
  })
})

describe('POST /entries/draft', () => {
  it('creates a draft and returns 201', async () => {
    const res = await app.inject({ method: 'POST', url: '/entries/draft', payload: balancedDraftPayload() })
    expect(res.statusCode).toBe(201)
    expect(res.json().id).toBeTruthy()
    expect(res.json().status).toBe('Draft')
  })

  it('updates an existing draft when id is provided', async () => {
    const created = await app.inject({ method: 'POST', url: '/entries/draft', payload: balancedDraftPayload() })
    const id = created.json().id
    const updated = await app.inject({ method: 'POST', url: '/entries/draft', payload: { ...balancedDraftPayload(), id, memo: 'Updated memo' } })
    expect(updated.statusCode).toBe(200)
    expect(updated.json().id).toBe(id)
    expect(updated.json().memo).toBe('Updated memo')
  })

  it('draft appears in GET /entries/drafts', async () => {
    await app.inject({ method: 'POST', url: '/entries/draft', payload: balancedDraftPayload() })
    const res = await app.inject({ method: 'GET', url: '/entries/drafts' })
    expect(res.json()).toHaveLength(1)
  })
})

describe('POST /entries/post', () => {
  it('posts a balanced draft and returns 200', async () => {
    const draft = await app.inject({ method: 'POST', url: '/entries/draft', payload: balancedDraftPayload() })
    const id = draft.json().id
    const res = await app.inject({ method: 'POST', url: '/entries/post', payload: { id } })
    expect(res.statusCode).toBe(200)
    expect(res.json().status).toBe('Posted')
  })

  it('posted entry appears in GET /entries, not in drafts', async () => {
    const draft = await app.inject({ method: 'POST', url: '/entries/draft', payload: balancedDraftPayload() })
    await app.inject({ method: 'POST', url: '/entries/post', payload: { id: draft.json().id } })
    const entries = await app.inject({ method: 'GET', url: '/entries' })
    const drafts = await app.inject({ method: 'GET', url: '/entries/drafts' })
    expect(entries.json()).toHaveLength(1)
    expect(drafts.json()).toHaveLength(0)
  })

  it('rejects an unbalanced entry with 422', async () => {
    const unbalanced = await app.inject({
      method: 'POST', url: '/entries/draft',
      payload: { date: '2025-06-15', memo: 'Bad', lines: [
        { accountId: cashId, amount: 500, type: 'debit' },
        { accountId: revenueId, amount: 400, type: 'credit' },
      ] },
    })
    const res = await app.inject({ method: 'POST', url: '/entries/post', payload: { id: unbalanced.json().id } })
    expect(res.statusCode).toBe(422)
  })

  it('rejects posting an already-posted entry with 400', async () => {
    const draft = await app.inject({ method: 'POST', url: '/entries/draft', payload: balancedDraftPayload() })
    const id = draft.json().id
    await app.inject({ method: 'POST', url: '/entries/post', payload: { id } })
    const res = await app.inject({ method: 'POST', url: '/entries/post', payload: { id } })
    expect(res.statusCode).toBe(400)
  })
})

describe('DELETE /entries/:id', () => {
  it('deletes a draft and returns 204', async () => {
    const draft = await app.inject({ method: 'POST', url: '/entries/draft', payload: balancedDraftPayload() })
    const id = draft.json().id
    const res = await app.inject({ method: 'DELETE', url: `/entries/${id}` })
    expect(res.statusCode).toBe(204)
    const drafts = await app.inject({ method: 'GET', url: '/entries/drafts' })
    expect(drafts.json()).toHaveLength(0)
  })

  it('returns 400 when attempting to delete a posted entry', async () => {
    const draft = await app.inject({ method: 'POST', url: '/entries/draft', payload: balancedDraftPayload() })
    const id = draft.json().id
    await app.inject({ method: 'POST', url: '/entries/post', payload: { id } })
    const res = await app.inject({ method: 'DELETE', url: `/entries/${id}` })
    expect(res.statusCode).toBe(400)
  })

  it('returns 404 for an unknown entry id', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/entries/no-such-id' })
    expect(res.statusCode).toBe(404)
  })
})
