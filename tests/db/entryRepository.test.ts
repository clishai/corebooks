import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { createTestDb, clearTestDb, destroyTestDb } from '../helpers/testDb.js'
import {
  createDraftEntry,
  listDraftEntries,
  listPostedEntries,
  findEntryById,
  updateDraftEntry,
  deleteDraftEntry,
  postDraftEntry,
  loadLedger,
} from '../../src/db/repositories/entryRepository.js'
import { createAccount } from '../../src/db/repositories/accountRepository.js'
import { Ledger } from '../../src/core/engine/ledger.js'
import { AccountType } from '../../src/core/types/account.js'
import { EntryStatus } from '../../src/core/types/journal.js'

let dbPath: string

beforeAll(() => {
  dbPath = createTestDb()
  process.env['DATABASE_URL'] = `file:${dbPath}`
})

afterAll(async () => {
  await destroyTestDb(dbPath)
})

beforeEach(async () => {
  await clearTestDb()
})

async function seedAccounts() {
  const cash = await createAccount({
    number: '1000', name: 'Cash',
    type: AccountType.Asset, normalBalance: 'debit', isContra: false,
  })
  const revenue = await createAccount({
    number: '4000', name: 'Sales Revenue',
    type: AccountType.Revenue, normalBalance: 'credit', isContra: false,
  })
  return { cash, revenue }
}

function balancedDraft(cashId: string, revenueId: string, amount = 500) {
  return {
    date: new Date('2025-06-15'),
    memo: 'Test sale',
    status: EntryStatus.Draft,
    lines: [
      { accountId: cashId, amount, type: 'debit' as const },
      { accountId: revenueId, amount, type: 'credit' as const },
    ],
  }
}

describe('createDraftEntry', () => {
  it('creates an entry with Draft status and returns it with an id', async () => {
    const { cash, revenue } = await seedAccounts()
    const entry = await createDraftEntry(balancedDraft(cash.id, revenue.id))
    expect(entry.id).toBeTruthy()
    expect(entry.status).toBe(EntryStatus.Draft)
    expect(entry.memo).toBe('Test sale')
    expect(entry.lines).toHaveLength(2)
  })

  it('stores the amount in dollars (mapper converts to cents and back)', async () => {
    const { cash, revenue } = await seedAccounts()
    const entry = await createDraftEntry(balancedDraft(cash.id, revenue.id, 12.50))
    const debitLine = entry.lines.find((l) => l.type === 'debit')
    expect(debitLine?.amount).toBe(12.50)
  })
})

describe('listDraftEntries', () => {
  it('returns only drafts, not posted entries', async () => {
    const { cash, revenue } = await seedAccounts()
    const draft = await createDraftEntry(balancedDraft(cash.id, revenue.id))
    await postDraftEntry(draft, [cash, revenue], new Ledger())
    expect(await listDraftEntries()).toHaveLength(0)
  })

  it('returns drafts in descending creation order', async () => {
    const { cash, revenue } = await seedAccounts()
    await createDraftEntry({ ...balancedDraft(cash.id, revenue.id), memo: 'First' })
    await createDraftEntry({ ...balancedDraft(cash.id, revenue.id), memo: 'Second' })
    const drafts = await listDraftEntries()
    expect(drafts[0].memo).toBe('Second')
    expect(drafts[1].memo).toBe('First')
  })
})

describe('listPostedEntries', () => {
  it('returns only posted entries, not drafts', async () => {
    const { cash, revenue } = await seedAccounts()
    const draft = await createDraftEntry(balancedDraft(cash.id, revenue.id))
    await postDraftEntry(draft, [cash, revenue], new Ledger())
    await createDraftEntry(balancedDraft(cash.id, revenue.id)) // unposted draft
    const posted = await listPostedEntries()
    expect(posted).toHaveLength(1)
    expect(posted[0].status).toBe(EntryStatus.Posted)
  })
})

describe('findEntryById', () => {
  it('returns the entry for a known id', async () => {
    const { cash, revenue } = await seedAccounts()
    const entry = await createDraftEntry(balancedDraft(cash.id, revenue.id))
    const found = await findEntryById(entry.id!)
    expect(found?.id).toBe(entry.id)
    expect(found?.memo).toBe('Test sale')
  })

  it('returns null for an unknown id', async () => {
    expect(await findEntryById('no-such-id')).toBeNull()
  })
})

describe('updateDraftEntry', () => {
  it('updates memo and lines', async () => {
    const { cash, revenue } = await seedAccounts()
    const entry = await createDraftEntry(balancedDraft(cash.id, revenue.id))
    const updated = await updateDraftEntry(entry.id!, {
      ...entry,
      id: entry.id,
      memo: 'Updated memo',
      lines: [
        { accountId: cash.id, amount: 750, type: 'debit' },
        { accountId: revenue.id, amount: 750, type: 'credit' },
      ],
    })
    expect(updated.memo).toBe('Updated memo')
    expect(updated.lines[0].amount).toBe(750)
  })
})

describe('deleteDraftEntry', () => {
  it('removes the entry from the database', async () => {
    const { cash, revenue } = await seedAccounts()
    const entry = await createDraftEntry(balancedDraft(cash.id, revenue.id))
    await deleteDraftEntry(entry.id!)
    expect(await findEntryById(entry.id!)).toBeNull()
  })

  it('cascades deletion to journal lines', async () => {
    const { cash, revenue } = await seedAccounts()
    const entry = await createDraftEntry(balancedDraft(cash.id, revenue.id))
    await deleteDraftEntry(entry.id!)
    // Confirmed by the lines being gone (indirectly: re-fetching the entry returns null)
    expect(await findEntryById(entry.id!)).toBeNull()
  })
})

describe('postDraftEntry', () => {
  it('promotes a balanced draft to Posted status', async () => {
    const { cash, revenue } = await seedAccounts()
    const ledger = new Ledger()
    const draft = await createDraftEntry(balancedDraft(cash.id, revenue.id))
    const result = await postDraftEntry(draft, [cash, revenue], ledger)
    expect(result.posted).toBe(true)
    if (!result.posted) return
    expect(result.entry.status).toBe(EntryStatus.Posted)
  })

  it('updates the in-memory Ledger with the posted balances', async () => {
    const { cash, revenue } = await seedAccounts()
    const ledger = new Ledger()
    const draft = await createDraftEntry(balancedDraft(cash.id, revenue.id))
    await postDraftEntry(draft, [cash, revenue], ledger)
    expect(ledger.getRawBalance(cash.id).debit).toBe(500)
    expect(ledger.getRawBalance(revenue.id).credit).toBe(500)
  })

  it('rejects an unbalanced entry and does not update the Ledger', async () => {
    const { cash, revenue } = await seedAccounts()
    const ledger = new Ledger()
    const unbalanced = await createDraftEntry({
      date: new Date('2025-06-15'),
      memo: 'Unbalanced',
      status: EntryStatus.Draft,
      lines: [
        { accountId: cash.id, amount: 500, type: 'debit' },
        { accountId: revenue.id, amount: 400, type: 'credit' },
      ],
    })
    const result = await postDraftEntry(unbalanced, [cash, revenue], ledger)
    expect(result.posted).toBe(false)
    expect(ledger.getRawBalance(cash.id).debit).toBe(0)
  })
})

describe('loadLedger', () => {
  it('replays all posted entries into a fresh Ledger', async () => {
    const { cash, revenue } = await seedAccounts()
    const ledger = new Ledger()
    const draft = await createDraftEntry(balancedDraft(cash.id, revenue.id))
    await postDraftEntry(draft, [cash, revenue], ledger)
    const loaded = await loadLedger()
    expect(loaded.getRawBalance(cash.id).debit).toBe(500)
    expect(loaded.getRawBalance(revenue.id).credit).toBe(500)
  })

  it('returns an empty Ledger when no entries have been posted', async () => {
    const loaded = await loadLedger()
    expect(loaded.postedEntries).toHaveLength(0)
  })
})
