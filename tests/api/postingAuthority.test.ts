import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { createTestDb, clearTestDb, destroyTestDb } from '../helpers/testDb.js'
import { createAccount } from '../../src/db/repositories/accountRepository.js'
import { createDraftEntry } from '../../src/db/repositories/entryRepository.js'
import { Ledger } from '../../src/core/engine/ledger.js'
import { AccountType } from '../../src/core/types/account.js'
import { EntryStatus } from '../../src/core/types/journal.js'
import { grantPostingAuthority } from '../../src/api/posting/authority.js'
import { postDraftWithAuthority } from '../../src/api/services/postingService.js'
import type { PostingAuthority } from '../../src/types/posting.js'

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

async function seedBalancedDraft() {
  const cash = await createAccount({
    number: '1000',
    name: 'Cash',
    type: AccountType.Asset,
    normalBalance: 'debit',
    isContra: false,
  })
  const revenue = await createAccount({
    number: '4000',
    name: 'Sales Revenue',
    type: AccountType.Revenue,
    normalBalance: 'credit',
    isContra: false,
  })
  const draft = await createDraftEntry({
    date: new Date('2026-01-15'),
    memo: 'Authority test',
    status: EntryStatus.Draft,
    lines: [
      { accountId: cash.id, amount: 100, type: 'debit' },
      { accountId: revenue.id, amount: 100, type: 'credit' },
    ],
  })
  return { draft, chart: [cash, revenue] }
}

describe('posting authority boundary', () => {
  it('allows explicit human authority to post a balanced draft', async () => {
    const { draft, chart } = await seedBalancedDraft()
    const result = await postDraftWithAuthority(
      draft,
      chart,
      new Ledger(),
      grantPostingAuthority('human'),
    )

    expect(result.posted).toBe(true)
  })

  it('rejects any AI-shaped authority before posting', async () => {
    const { draft, chart } = await seedBalancedDraft()
    const aiAuthority = { channel: 'ai' } as unknown as PostingAuthority

    await expect(
      postDraftWithAuthority(draft, chart, new Ledger(), aiAuthority),
    ).rejects.toThrow('not allowed')
  })
})
