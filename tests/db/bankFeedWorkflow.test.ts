import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { createTestDb, clearTestDb, destroyTestDb } from '../helpers/testDb.js'
import { createAccount } from '../../src/db/repositories/accountRepository.js'
import { createBankRule, listBankRules, deleteBankRule } from '../../src/db/repositories/bankRuleRepository.js'
import { listDraftEntries } from '../../src/db/repositories/entryRepository.js'
import { importBankFeedCsv } from '../../src/api/services/bankFeedService.js'
import { AccountType } from '../../src/core/types/account.js'

let dbPath: string

beforeAll(() => {
  dbPath = createTestDb()
  process.env['DATABASE_URL'] = `file:${dbPath}`
})

afterAll(async () => { await destroyTestDb(dbPath) })
beforeEach(async () => { await clearTestDb() })

describe('bank feed workflow', () => {
  it('creates draft entries from matched bank rules and deletes rules cleanly', async () => {
    const bank = await createAccount({ number: '1000', name: 'Checking', type: AccountType.Asset, normalBalance: 'debit', isContra: false })
    const expense = await createAccount({ number: '6100', name: 'Bank Fees', type: AccountType.Expense, normalBalance: 'debit', isContra: false })
    const rule = await createBankRule({
      name: 'Fees',
      priority: 10,
      enabled: true,
      matchField: 'memo',
      matchType: 'contains',
      pattern: 'fee',
      accountId: expense.id,
      entryType: 'expense',
      memo: 'Bank fee',
      paymentMethod: 'Bank feed',
    })

    const result = await importBankFeedCsv('Date,Payee,Memo,Amount\n2026-01-02,Bank,Monthly fee,-12.50', {
      bankAccountId: bank.id,
    })

    expect(result.draftsCreated).toBe(1)
    expect(await listDraftEntries()).toHaveLength(1)

    await deleteBankRule(rule.id)
    expect(await listBankRules()).toHaveLength(0)
  })
})
