import { EntryStatus } from '../../core/types/journal.js'
import type { JournalEntry } from '../../core/types/journal.js'
import { getPrismaClient } from '../../db/client.js'
import { createDraftEntry } from '../../db/repositories/entryRepository.js'
import { listBankRules, type BankRule } from '../../db/repositories/bankRuleRepository.js'
import { logAuditEvent } from '../../db/repositories/auditRepository.js'
import { parseCSVText } from './importService.js'

export interface BankFeedImportOptions {
  bankAccountId: string
}

export interface BankFeedImportResult {
  draftsCreated: number
  rowsSkipped: number
  warnings: string[]
}

interface BankTransaction {
  date: string
  payee: string
  memo: string
  amount: number
}

function headerIndex(headers: string[], names: string[]): number {
  const normalized = headers.map((h) => h.toLowerCase().trim())
  return normalized.findIndex((h) => names.includes(h))
}

function parseAmount(raw: string): number {
  const cleaned = raw.replace(/[$,\s]/g, '').replace(/^\((.*)\)$/, '-$1')
  const value = Number(cleaned)
  return Number.isFinite(value) ? value : 0
}

function normalizeDate(raw: string): string | null {
  const trimmed = raw.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed
  const parsed = new Date(trimmed)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString().slice(0, 10)
}

function parseTransactions(csv: string): BankTransaction[] {
  const rows = parseCSVText(csv)
  const headers = rows[0] ?? []
  const dataRows = rows.slice(1)
  const dateIdx = headerIndex(headers, ['date', 'posted date', 'transaction date'])
  const payeeIdx = headerIndex(headers, ['payee', 'name', 'description'])
  const memoIdx = headerIndex(headers, ['memo', 'description', 'details'])
  const amountIdx = headerIndex(headers, ['amount', 'net amount'])
  const debitIdx = headerIndex(headers, ['debit', 'withdrawal', 'withdrawals'])
  const creditIdx = headerIndex(headers, ['credit', 'deposit', 'deposits'])

  return dataRows.flatMap((row) => {
    const date = dateIdx >= 0 ? normalizeDate(row[dateIdx] ?? '') : null
    if (!date) return []
    const payee = payeeIdx >= 0 ? row[payeeIdx] ?? '' : ''
    const memo = memoIdx >= 0 ? row[memoIdx] ?? payee : payee
    let amount = amountIdx >= 0 ? parseAmount(row[amountIdx] ?? '') : 0
    if (amount === 0 && (debitIdx >= 0 || creditIdx >= 0)) {
      const debit = debitIdx >= 0 ? parseAmount(row[debitIdx] ?? '') : 0
      const credit = creditIdx >= 0 ? parseAmount(row[creditIdx] ?? '') : 0
      amount = credit - debit
    }
    if (amount === 0) return []
    return [{ date, payee, memo, amount }]
  })
}

function matchesRule(rule: BankRule, tx: BankTransaction): boolean {
  if (!rule.enabled) return false
  const value = rule.matchField === 'amount'
    ? String(Math.abs(tx.amount))
    : rule.matchField === 'payee'
      ? tx.payee
      : tx.memo
  const haystack = value.toLowerCase()
  const needle = rule.pattern.toLowerCase()
  if (rule.matchType === 'equals') return haystack === needle
  if (rule.matchType === 'startsWith') return haystack.startsWith(needle)
  return haystack.includes(needle)
}

function buildDraft(tx: BankTransaction, bankAccountId: string, rule: BankRule): JournalEntry | null {
  if (!rule.accountId) return null
  const amount = Math.abs(tx.amount)
  if (rule.entryType === 'transfer') return null
  const isInflow = rule.entryType === 'income' ? true : rule.entryType === 'expense' ? false : tx.amount > 0
  const memo = rule.memo || tx.memo || tx.payee || 'Bank feed transaction'
  const lines: JournalEntry['lines'] = isInflow
    ? [
        { accountId: bankAccountId, amount, type: 'debit' },
        { accountId: rule.accountId, amount, type: 'credit' },
      ]
    : [
        { accountId: rule.accountId, amount, type: 'debit' },
        { accountId: bankAccountId, amount, type: 'credit' },
      ]
  return {
    date: new Date(`${tx.date}T12:00:00.000Z`),
    memo,
    paymentMethod: rule.paymentMethod ?? 'Bank feed',
    status: EntryStatus.Draft,
    lines,
  }
}

export async function importBankFeedCsv(csv: string, options: BankFeedImportOptions): Promise<BankFeedImportResult> {
  const rules = await listBankRules()
  const transactions = parseTransactions(csv)
  const warnings: string[] = []
  let draftsCreated = 0
  let rowsSkipped = 0
  const prisma = getPrismaClient()

  for (const tx of transactions) {
    const rule = rules.find((candidate) => matchesRule(candidate, tx))
    if (!rule) {
      rowsSkipped++
      warnings.push(`${tx.date} ${tx.payee || tx.memo}: no bank rule matched.`)
      continue
    }
    const draftInput = buildDraft(tx, options.bankAccountId, rule)
    if (!draftInput) {
      rowsSkipped++
      warnings.push(`${tx.date} ${tx.payee || tx.memo}: matched rule "${rule.name}" has no account.`)
      continue
    }
    const draft = await createDraftEntry(draftInput)
    if (draft.id) {
      await prisma.journalEntry.update({
        where: { id: draft.id },
        data: { sourceType: 'bank-feed', sourceId: rule.id } as Parameters<typeof prisma.journalEntry.update>[0]['data'],
      })
      await logAuditEvent({
        action: 'draft.created',
        entityType: 'JournalEntry',
        entityId: draft.id,
        detail: { source: 'bank-feed', ruleId: rule.id, payee: tx.payee, amount: tx.amount },
      })
    }
    draftsCreated++
  }

  return { draftsCreated, rowsSkipped, warnings }
}
