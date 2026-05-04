// tests/db/recurringRepository.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { createTestDb, destroyTestDb } from '../helpers/testDb'
import {
  createRecurringTemplate,
  listRecurringTemplates,
  getRecurringTemplate,
  deleteRecurringTemplate,
  getOverdueTemplates,
  advanceNextDue,
} from '../../src/db/repositories/recurringRepository'

let dbPath: string

beforeAll(async () => {
  dbPath = createTestDb()
  process.env['DATABASE_URL'] = `file:${dbPath}`
})

afterAll(async () => { await destroyTestDb(dbPath) })

beforeEach(async () => {
  const { getPrismaClient } = await import('../../src/db/client')
  const prisma = getPrismaClient()
  await prisma.recurringLine.deleteMany({})
  await prisma.recurringTemplate.deleteMany({})
  await prisma.journalLine.deleteMany({})
  await prisma.journalEntry.deleteMany({})
  await prisma.account.deleteMany({})
})

async function seedAccount() {
  const { getPrismaClient } = await import('../../src/db/client')
  const prisma = getPrismaClient()
  return prisma.account.create({
    data: { id: 'acc1', number: '1000', name: 'Cash', type: 'Asset', normalBalance: 'debit', isContra: false },
  })
}

describe('recurring repository', () => {
  it('creates and retrieves a template', async () => {
    await seedAccount()
    const t = await createRecurringTemplate({
      name: 'Monthly Rent',
      memo: 'Rent payment',
      schedule: 'monthly',
      nextDue: new Date('2026-06-01'),
      autoPost: false,
      lines: [{ accountId: 'acc1', type: 'debit', amount: 1000 }],
    })
    expect(t.name).toBe('Monthly Rent')
    expect(t.lines[0].amount).toBe(1000)
  })

  it('lists all templates', async () => {
    await seedAccount()
    await createRecurringTemplate({ name: 'T1', memo: 'm', schedule: 'monthly', nextDue: new Date(), autoPost: false, lines: [{ accountId: 'acc1', type: 'debit', amount: 100 }] })
    await createRecurringTemplate({ name: 'T2', memo: 'm', schedule: 'weekly', nextDue: new Date(), autoPost: false, lines: [{ accountId: 'acc1', type: 'credit', amount: 100 }] })
    const list = await listRecurringTemplates()
    expect(list.length).toBe(2)
  })

  it('returns overdue templates', async () => {
    await seedAccount()
    const past = new Date(Date.now() - 86400000)
    const future = new Date(Date.now() + 86400000)
    await createRecurringTemplate({ name: 'Past', memo: 'm', schedule: 'monthly', nextDue: past, autoPost: false, lines: [{ accountId: 'acc1', type: 'debit', amount: 50 }] })
    await createRecurringTemplate({ name: 'Future', memo: 'm', schedule: 'monthly', nextDue: future, autoPost: false, lines: [{ accountId: 'acc1', type: 'debit', amount: 50 }] })
    const overdue = await getOverdueTemplates()
    expect(overdue.length).toBe(1)
    expect(overdue[0].name).toBe('Past')
  })

  it('advances nextDue by one month', async () => {
    await seedAccount()
    const due = new Date('2026-01-15')
    const t = await createRecurringTemplate({ name: 'T', memo: 'm', schedule: 'monthly', nextDue: due, autoPost: false, lines: [{ accountId: 'acc1', type: 'debit', amount: 100 }] })
    const next = await advanceNextDue(t.id, 'monthly', due)
    expect(next.getMonth()).toBe(1) // February (0-indexed)
  })

  it('deletes a template', async () => {
    await seedAccount()
    const t = await createRecurringTemplate({ name: 'T', memo: 'm', schedule: 'monthly', nextDue: new Date(), autoPost: false, lines: [{ accountId: 'acc1', type: 'debit', amount: 100 }] })
    await deleteRecurringTemplate(t.id)
    expect(await getRecurringTemplate(t.id)).toBeNull()
  })
})
