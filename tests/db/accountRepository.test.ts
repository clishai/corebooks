import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { createTestDb, clearTestDb, destroyTestDb } from '../helpers/testDb.js'
import {
  createAccount,
  listAccounts,
  findAccountById,
  findAccountByNumber,
  updateAccount,
} from '../../src/db/repositories/accountRepository.js'
import { AccountType } from '../../src/core/types/account.js'

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

const cashInput = {
  number: '1000',
  name: 'Cash',
  type: AccountType.Asset,
  normalBalance: 'debit' as const,
  isContra: false,
}

const revenueInput = {
  number: '4000',
  name: 'Sales Revenue',
  type: AccountType.Revenue,
  normalBalance: 'credit' as const,
  isContra: false,
}

describe('createAccount', () => {
  it('returns the created account with a generated id', async () => {
    const account = await createAccount(cashInput)
    expect(account.id).toBeTruthy()
    expect(account.number).toBe('1000')
    expect(account.name).toBe('Cash')
    expect(account.type).toBe(AccountType.Asset)
    expect(account.normalBalance).toBe('debit')
    expect(account.isContra).toBe(false)
  })

  it('throws on a duplicate account number', async () => {
    await createAccount(cashInput)
    await expect(createAccount(cashInput)).rejects.toThrow()
  })

  it('stores contraTo when provided', async () => {
    const contra = await createAccount({
      number: '1010',
      name: 'Allowance for Doubtful Accounts',
      type: AccountType.Asset,
      normalBalance: 'credit' as const,
      isContra: true,
      contraTo: AccountType.Asset,
    })
    expect(contra.isContra).toBe(true)
    expect(contra.contraTo).toBe(AccountType.Asset)
  })
})

describe('listAccounts', () => {
  it('returns an empty array when no accounts exist', async () => {
    expect(await listAccounts()).toEqual([])
  })

  it('returns accounts sorted by number ascending', async () => {
    await createAccount(revenueInput)
    await createAccount(cashInput)
    const accounts = await listAccounts()
    expect(accounts.map((a) => a.number)).toEqual(['1000', '4000'])
  })
})

describe('findAccountById', () => {
  it('returns the account for a known id', async () => {
    const created = await createAccount(cashInput)
    const found = await findAccountById(created.id)
    expect(found?.id).toBe(created.id)
    expect(found?.number).toBe('1000')
  })

  it('returns null for an unknown id', async () => {
    expect(await findAccountById('no-such-id')).toBeNull()
  })
})

describe('findAccountByNumber', () => {
  it('returns the account for a known number', async () => {
    await createAccount(cashInput)
    const found = await findAccountByNumber('1000')
    expect(found?.name).toBe('Cash')
  })

  it('returns null for an unknown number', async () => {
    expect(await findAccountByNumber('9999')).toBeNull()
  })
})

describe('updateAccount', () => {
  it('updates the account name and returns the updated row', async () => {
    const account = await createAccount(cashInput)
    const updated = await updateAccount(account.id, { name: 'Petty Cash' })
    expect(updated.name).toBe('Petty Cash')
    expect(updated.number).toBe('1000')
  })

  it('persists the update in subsequent reads', async () => {
    const account = await createAccount(cashInput)
    await updateAccount(account.id, { name: 'Petty Cash' })
    const found = await findAccountById(account.id)
    expect(found?.name).toBe('Petty Cash')
  })
})
