import { AccountType } from '../../core/types/account.js'
import { EntryStatus } from '../../core/types/journal.js'
import type { Account } from '../../core/types/account.js'
import type { JournalEntry } from '../../core/types/journal.js'
import type { Ledger } from '../../core/engine/ledger.js'
import { listAccounts, createAccount } from '../../db/repositories/accountRepository.js'
import { createDraftEntry, postDraftEntry } from '../../db/repositories/entryRepository.js'

// ── Public interfaces ─────────────────────────────────────────────────────────

export interface CsvMapping {
  date: string
  account: string
  debit: string
  credit: string
  memo?: string
  reference?: string
  paymentMethod?: string
}

export interface ImportOptions {
  createMissingAccounts: boolean
  importAs: 'draft' | 'posted'
}

export interface ImportResult {
  accountsCreated: number
  accountsSkipped: number
  entriesCreated: number
  entriesSkipped: number
  warnings: string[]
}

// ── RFC 4180 CSV parser ───────────────────────────────────────────────────────

export function parseCSVText(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  const s = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!
    const next = s[i + 1]
    if (inQuotes) {
      if (ch === '"' && next === '"') { field += '"'; i++ }
      else if (ch === '"') { inQuotes = false }
      else { field += ch }
    } else {
      if (ch === '"') { inQuotes = true }
      else if (ch === ',') { row.push(field.trim()); field = '' }
      else if (ch === '\n') {
        row.push(field.trim()); field = ''
        if (row.some((f) => f.length > 0)) rows.push(row)
        row = []
      } else { field += ch }
    }
  }
  row.push(field.trim())
  if (row.some((f) => f.length > 0)) rows.push(row)
  return rows
}

export function parseCSVHeaders(text: string): string[] {
  return parseCSVText(text)[0] ?? []
}

// ── Amount + date helpers ─────────────────────────────────────────────────────

function parseAmount(raw: string): number {
  if (!raw) return 0
  const val = parseFloat(raw.trim().replace(/[$,\s]/g, ''))
  return isNaN(val) ? 0 : Math.abs(val)
}

function normalizeDate(raw: string): string | null {
  const s = raw.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (m) return `${m[3]}-${m[1]!.padStart(2, '0')}-${m[2]!.padStart(2, '0')}`
  const d = new Date(s)
  if (!isNaN(d.getTime())) return d.toISOString().split('T')[0]!
  return null
}

// ── Account resolution ────────────────────────────────────────────────────────

function nextAccountNumber(accounts: Account[]): string {
  const nums = accounts.map((a) => parseInt(a.number, 10)).filter((n) => !isNaN(n))
  return String(nums.length > 0 ? Math.max(Math.max(...nums) + 1, 9000) : 9000)
}

// ── Internal entry shape ──────────────────────────────────────────────────────

interface ParsedLine {
  accountName: string
  debit: number
  credit: number
}

interface ParsedEntry {
  date: string
  memo: string
  paymentMethod?: string
  lines: ParsedLine[]
}

// ── Common persist step ───────────────────────────────────────────────────────

async function persistParsedEntries(
  parsed: ParsedEntry[],
  options: ImportOptions,
  ledger: Ledger,
): Promise<Omit<ImportResult, 'accountsSkipped'>> {
  const accounts: Account[] = await listAccounts()
  const nameMap = new Map<string, Account>()
  const numberMap = new Map<string, Account>()
  for (const a of accounts) {
    nameMap.set(a.name.toLowerCase(), a)
    numberMap.set(a.number, a)
  }
  const initialCount = accounts.length
  const warnings: string[] = []
  let entriesCreated = 0
  let entriesSkipped = 0

  async function resolve(raw: string): Promise<Account | null> {
    const norm = raw.toLowerCase().trim()
    const byName = nameMap.get(norm)
    if (byName) return byName
    const byNum = numberMap.get(raw.trim())
    if (byNum) return byNum
    if (!options.createMissingAccounts) return null
    const num = nextAccountNumber(accounts)
    const created = await createAccount({
      number: num,
      name: raw.trim(),
      type: AccountType.Asset,
      normalBalance: 'debit',
      isContra: false,
    })
    accounts.push(created)
    nameMap.set(created.name.toLowerCase(), created)
    numberMap.set(created.number, created)
    return created
  }

  for (const pe of parsed) {
    const lines: JournalEntry['lines'] = []
    let ok = true

    for (const pl of pe.lines) {
      if (!pl.accountName.trim()) continue
      const acct = await resolve(pl.accountName)
      if (!acct) {
        warnings.push(
          `Entry "${pe.memo || pe.date}": account "${pl.accountName}" not found — entry skipped.`,
        )
        ok = false
        break
      }
      if (pl.debit > 0) lines.push({ accountId: acct.id, amount: pl.debit, type: 'debit' })
      if (pl.credit > 0) lines.push({ accountId: acct.id, amount: pl.credit, type: 'credit' })
    }

    if (!ok || lines.length < 2) {
      entriesSkipped++
      continue
    }

    const draft = await createDraftEntry({
      date: new Date(pe.date + 'T12:00:00.000Z'),
      memo: pe.memo,
      paymentMethod: pe.paymentMethod,
      status: EntryStatus.Draft,
      lines,
    })

    if (options.importAs === 'posted') {
      const result = await postDraftEntry(draft, accounts, ledger)
      if (!result.posted) {
        const errs = (result.errors as Array<{ message: string }>).map((e) => e.message).join('; ')
        warnings.push(`Entry "${pe.memo || pe.date}": validation failed (${errs}) — left as draft.`)
      }
    }

    entriesCreated++
  }

  return {
    accountsCreated: accounts.length - initialCount,
    entriesCreated,
    entriesSkipped,
    warnings,
  }
}

// ── CoreBooks JSON import ─────────────────────────────────────────────────────

interface CoreBooksExport {
  version?: string
  accounts?: Array<{
    id: string
    number: string
    name: string
    type: string
    normalBalance: string
    isContra: boolean
    contraTo?: string
    classification?: string
  }>
  entries?: Array<{
    id?: string
    date: string
    memo: string
    status?: string
    paymentMethod?: string
    lines: Array<{ accountId: string; amount: number; type: string }>
  }>
}

export async function importCoreJSON(
  raw: string,
  ledger: Ledger,
  options: ImportOptions,
): Promise<ImportResult> {
  let parsed: CoreBooksExport
  try {
    parsed = JSON.parse(raw) as CoreBooksExport
  } catch {
    throw new Error('Invalid JSON: could not parse the file.')
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('File does not appear to be a CoreBooks export.')
  }

  const exportedAccounts = parsed.accounts ?? []
  const exportedEntries = parsed.entries ?? []

  const existing = await listAccounts()
  const byNumber = new Map(existing.map((a) => [a.number, a]))
  // Map exported account IDs to live DB IDs (they change when wiped + re-imported)
  const idMap = new Map<string, string>()

  let accountsCreated = 0
  let accountsSkipped = 0

  for (const ea of exportedAccounts) {
    const live = byNumber.get(ea.number)
    if (live) {
      idMap.set(ea.id, live.id)
      accountsSkipped++
    } else {
      const created = await createAccount({
        number: ea.number,
        name: ea.name,
        type: ea.type as AccountType,
        normalBalance: ea.normalBalance as 'debit' | 'credit',
        isContra: ea.isContra,
        contraTo: ea.contraTo as AccountType | undefined,
        classification: ea.classification as 'current' | 'non-current' | undefined,
      })
      idMap.set(ea.id, created.id)
      byNumber.set(created.number, created)
      accountsCreated++
    }
  }

  const allAccounts = await listAccounts()
  let entriesCreated = 0
  let entriesSkipped = 0
  const warnings: string[] = []

  for (const ee of exportedEntries) {
    const lines: JournalEntry['lines'] = []
    let ok = true

    for (const el of ee.lines) {
      const newId = idMap.get(el.accountId)
      if (!newId) {
        warnings.push(
          `Entry "${ee.memo || ee.date}": account id "${el.accountId}" has no match — entry skipped.`,
        )
        ok = false
        break
      }
      lines.push({ accountId: newId, amount: el.amount, type: el.type as 'debit' | 'credit' })
    }

    if (!ok || lines.length < 2) {
      entriesSkipped++
      continue
    }

    const dateStr = normalizeDate(ee.date) ?? (ee.date.includes('T') ? ee.date.split('T')[0]! : ee.date)
    const draft = await createDraftEntry({
      date: new Date(dateStr + 'T12:00:00.000Z'),
      memo: ee.memo,
      paymentMethod: ee.paymentMethod,
      status: EntryStatus.Draft,
      lines,
    })

    if (options.importAs === 'posted') {
      const result = await postDraftEntry(draft, allAccounts, ledger)
      if (!result.posted) {
        const errs = (result.errors as Array<{ message: string }>).map((e) => e.message).join('; ')
        warnings.push(`Entry "${ee.memo || dateStr}": validation failed (${errs}) — left as draft.`)
      }
    }

    entriesCreated++
  }

  return { accountsCreated, accountsSkipped, entriesCreated, entriesSkipped, warnings }
}

// ── CSV import ────────────────────────────────────────────────────────────────

export async function importCSV(
  raw: string,
  mapping: CsvMapping,
  options: ImportOptions,
  ledger: Ledger,
): Promise<ImportResult> {
  const rows = parseCSVText(raw)
  if (rows.length < 2) throw new Error('CSV file has no data rows.')

  const headers = rows[0]!
  const idx = (col: string | undefined): number =>
    col ? headers.findIndex((h) => h.toLowerCase() === col.toLowerCase()) : -1

  const dateIdx = idx(mapping.date)
  const accountIdx = idx(mapping.account)
  const debitIdx = idx(mapping.debit)
  const creditIdx = idx(mapping.credit)
  const memoIdx = idx(mapping.memo)
  const refIdx = idx(mapping.reference)
  const pmIdx = idx(mapping.paymentMethod)

  if (dateIdx === -1) throw new Error(`Date column "${mapping.date}" not found in CSV headers.`)
  if (accountIdx === -1) throw new Error(`Account column "${mapping.account}" not found in CSV headers.`)
  if (debitIdx === -1 && creditIdx === -1) {
    throw new Error('Neither debit nor credit column could be found in the CSV headers.')
  }

  const cell = (row: string[], i: number): string => (i >= 0 && i < row.length ? row[i] ?? '' : '')

  // Group rows into entries. If a reference column is mapped, group by (ref, date).
  // Otherwise accumulate rows sequentially until debits and credits balance.
  const entryMap = new Map<string, { date: string; memo: string; paymentMethod?: string; lines: ParsedLine[] }>()
  const entryOrder: string[] = []
  let autoRef = 0
  let currentAutoKey: string | null = null
  let runningDebit = 0
  let runningCredit = 0

  for (const row of rows.slice(1)) {
    const rawDate = cell(row, dateIdx)
    const date = normalizeDate(rawDate)
    if (!date) continue

    const accountName = cell(row, accountIdx)
    if (!accountName) continue

    const debit = parseAmount(cell(row, debitIdx))
    const credit = parseAmount(cell(row, creditIdx))
    const memo = cell(row, memoIdx)
    const ref = cell(row, refIdx)
    const paymentMethod = cell(row, pmIdx) || undefined

    let key: string

    if (refIdx >= 0 && ref) {
      key = `${ref}__${date}`
    } else {
      // Auto-group: the previous group is done when its running totals balance
      if (currentAutoKey !== null && runningDebit > 0 && Math.abs(runningDebit - runningCredit) < 0.005) {
        autoRef++
        runningDebit = 0
        runningCredit = 0
        currentAutoKey = null
      }
      if (currentAutoKey === null) {
        currentAutoKey = `auto-${autoRef}-${date}`
      }
      key = currentAutoKey
      runningDebit += debit
      runningCredit += credit
    }

    if (!entryMap.has(key)) {
      entryMap.set(key, { date, memo: memo || '', paymentMethod, lines: [] })
      entryOrder.push(key)
    }
    entryMap.get(key)!.lines.push({ accountName, debit, credit })
  }

  const parsed = entryOrder.map((k) => entryMap.get(k)!).filter(Boolean)
  const result = await persistParsedEntries(parsed, options, ledger)
  return { ...result, accountsSkipped: 0 }
}

// ── QuickBooks Desktop IIF import ─────────────────────────────────────────────

export async function importIIF(
  raw: string,
  options: ImportOptions,
  ledger: Ledger,
): Promise<ImportResult> {
  const lines = raw.split(/\r?\n/)
  const trnsHeaders = new Map<string, number>()
  const splHeaders = new Map<string, number>()
  const parsed: ParsedEntry[] = []
  let current: ParsedEntry | null = null

  const getCol = (m: Map<string, number>, cols: string[], key: string): string => {
    const i = m.get(key)
    return i !== undefined ? (cols[i] ?? '').trim() : ''
  }

  for (const line of lines) {
    const cols = line.split('\t')
    const type = (cols[0] ?? '').toUpperCase().trim()

    if (type === '!TRNS') {
      cols.slice(1).forEach((h, i) => trnsHeaders.set(h.toUpperCase().trim(), i + 1))
    } else if (type === '!SPL') {
      cols.slice(1).forEach((h, i) => splHeaders.set(h.toUpperCase().trim(), i + 1))
    } else if (type === 'TRNS') {
      const rawDate = getCol(trnsHeaders, cols, 'DATE')
      const date = normalizeDate(rawDate) ?? rawDate
      const accountName = getCol(trnsHeaders, cols, 'ACCNT')
      const rawAmount = getCol(trnsHeaders, cols, 'AMOUNT')
      const amount = parseFloat(rawAmount.replace(/[$,]/g, '')) || 0
      const memo = getCol(trnsHeaders, cols, 'MEMO')

      current = { date, memo, lines: [] }
      if (accountName) {
        current.lines.push({
          accountName,
          debit: amount >= 0 ? amount : 0,
          credit: amount < 0 ? Math.abs(amount) : 0,
        })
      }
    } else if (type === 'SPL' && current) {
      const accountName = getCol(splHeaders, cols, 'ACCNT')
      const rawAmount = getCol(splHeaders, cols, 'AMOUNT')
      const amount = parseFloat(rawAmount.replace(/[$,]/g, '')) || 0
      if (accountName) {
        current.lines.push({
          accountName,
          debit: amount >= 0 ? amount : 0,
          credit: amount < 0 ? Math.abs(amount) : 0,
        })
      }
    } else if (type === 'ENDTRNS' && current) {
      if (current.lines.length >= 2) parsed.push(current)
      current = null
    }
  }

  const result = await persistParsedEntries(parsed, options, ledger)
  return { ...result, accountsSkipped: 0 }
}
