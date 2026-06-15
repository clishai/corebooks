import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { createTestDb, clearTestDb, destroyTestDb } from '../helpers/testDb.js'
import { createAccount } from '../../src/db/repositories/accountRepository.js'
import { createDraftEntry } from '../../src/db/repositories/entryRepository.js'
import { createReconciliationSession, listReconciliationItems, setReconciliationItem, getReconciliationSession } from '../../src/db/repositories/reconciliationRepository.js'
import { postDraftWithAuthority } from '../../src/api/services/postingService.js'
import { grantPostingAuthority } from '../../src/api/posting/authority.js'
import { Ledger } from '../../src/core/engine/ledger.js'
import { AccountType } from '../../src/core/types/account.js'
import { EntryStatus } from '../../src/core/types/journal.js'

let dbPath: string

beforeAll(() => {
  dbPath = createTestDb()
  process.env['DATABASE_URL'] = `file:${dbPath}`
})

afterAll(async () => { await destroyTestDb(dbPath) })
beforeEach(async () => { await clearTestDb() })

describe('reconciliation repository', () => {
  it('tracks cleared items and computes difference', async () => {
    const bank = await createAccount({ number: '1000', name: 'Checking', type: AccountType.Asset, normalBalance: 'debit', isContra: false })
    const revenue = await createAccount({ number: '4000', name: 'Sales', type: AccountType.Revenue, normalBalance: 'credit', isContra: false })
    const ledger = new Ledger()
    const draft = await createDraftEntry({
      date: new Date('2026-01-05'),
      memo: 'Deposit',
      status: EntryStatus.Draft,
      lines: [
        { accountId: bank.id, amount: 250, type: 'debit' },
        { accountId: revenue.id, amount: 250, type: 'credit' },
      ],
    })
    const posted = await postDraftWithAuthority(draft, [bank, revenue], ledger, grantPostingAuthority('human'))
    if (!posted.posted || !posted.entry.id) throw new Error('expected posted entry')

    const session = await createReconciliationSession({
      accountId: bank.id,
      statementDate: new Date('2026-01-31'),
      endingBalance: 250,
    })
    const items = await listReconciliationItems(session.id)
    expect(items).toHaveLength(1)

    await setReconciliationItem(session.id, posted.entry.id, true)
    const updated = await getReconciliationSession(session.id)
    expect(updated.clearedBalance).toBe(250)
    expect(updated.difference).toBe(0)
  })
})
