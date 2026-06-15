import { getPrismaClient } from '../client.js'

export type BankRuleMatchField = 'payee' | 'memo' | 'amount'
export type BankRuleMatchType = 'contains' | 'startsWith' | 'equals'
export type BankRuleEntryType = 'expense' | 'income' | 'transfer'

export interface BankRuleInput {
  name: string
  priority: number
  enabled: boolean
  matchField: BankRuleMatchField
  matchType: BankRuleMatchType
  pattern: string
  accountId?: string | null
  entryType: BankRuleEntryType
  memo?: string | null
  paymentMethod?: string | null
}

export interface BankRule extends BankRuleInput {
  id: string
  createdAt: Date
  updatedAt: Date
}

export const BANK_RULE_TEMPLATES: Array<Omit<BankRuleInput, 'accountId'>> = [
  {
    name: 'Bank fees',
    priority: 20,
    enabled: true,
    matchField: 'memo',
    matchType: 'contains',
    pattern: 'fee',
    entryType: 'expense',
    memo: 'Bank fee',
  },
  {
    name: 'Interest income',
    priority: 20,
    enabled: true,
    matchField: 'memo',
    matchType: 'contains',
    pattern: 'interest',
    entryType: 'income',
    memo: 'Interest income',
  },
  {
    name: 'Software subscriptions',
    priority: 40,
    enabled: true,
    matchField: 'payee',
    matchType: 'contains',
    pattern: 'software',
    entryType: 'expense',
    memo: 'Software subscription',
  },
]

function normalize(row: {
  id: string
  name: string
  priority: number
  enabled: boolean
  matchField: string
  matchType: string
  pattern: string
  accountId: string | null
  entryType: string
  memo: string | null
  paymentMethod: string | null
  createdAt: Date
  updatedAt: Date
}): BankRule {
  return {
    id: row.id,
    name: row.name,
    priority: row.priority,
    enabled: row.enabled,
    matchField: row.matchField as BankRuleMatchField,
    matchType: row.matchType as BankRuleMatchType,
    pattern: row.pattern,
    accountId: row.accountId,
    entryType: row.entryType as BankRuleEntryType,
    memo: row.memo,
    paymentMethod: row.paymentMethod,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export async function listBankRules(): Promise<BankRule[]> {
  const prisma = getPrismaClient()
  const rows = await prisma.bankRule.findMany({ orderBy: [{ priority: 'asc' }, { name: 'asc' }] })
  return rows.map(normalize)
}

export async function createBankRule(input: BankRuleInput): Promise<BankRule> {
  const prisma = getPrismaClient()
  const row = await prisma.bankRule.create({
    data: {
      name: input.name,
      priority: input.priority,
      enabled: input.enabled,
      matchField: input.matchField,
      matchType: input.matchType,
      pattern: input.pattern,
      accountId: input.accountId ?? null,
      entryType: input.entryType,
      memo: input.memo ?? null,
      paymentMethod: input.paymentMethod ?? null,
    },
  })
  return normalize(row)
}

export async function updateBankRule(id: string, input: Partial<BankRuleInput>): Promise<BankRule> {
  const prisma = getPrismaClient()
  const row = await prisma.bankRule.update({
    where: { id },
    data: { ...input, updatedAt: new Date() },
  })
  return normalize(row)
}

export async function deleteBankRule(id: string): Promise<void> {
  const prisma = getPrismaClient()
  await prisma.bankRule.delete({ where: { id } })
}
