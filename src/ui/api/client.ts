export type AccountType = 'Asset' | 'Liability' | 'Equity' | 'Revenue' | 'Expense'

export interface Account {
  id: string
  number: string
  name: string
  type: AccountType
  normalBalance: 'debit' | 'credit'
  isContra: boolean
  contraTo?: AccountType
  classification?: 'current' | 'non-current'
}

export interface JournalLine {
  accountId: string
  amount: number
  type: 'debit' | 'credit'
  memo?: string
}

export interface JournalEntry {
  id?: string
  date: string
  memo: string
  status: 'Draft' | 'Posted'
  paymentMethod?: string
  lines: JournalLine[]
  reversalOf?: string
}

export interface CreateAccountInput {
  number: string
  name: string
  type: AccountType
  normalBalance: 'debit' | 'credit'
  isContra: boolean
  contraTo?: AccountType
  classification?: 'current' | 'non-current'
}

export interface DraftLineInput {
  accountId: string
  amount: number
  type: 'debit' | 'credit'
}

export interface DraftEntryInput {
  id?: string
  date: string
  memo: string
  paymentMethod?: string
  lines: DraftLineInput[]
}

export interface TrialBalanceRow {
  account: Account
  debit: number
  credit: number
}

export interface TrialBalance {
  rows: TrialBalanceRow[]
  totalDebits: number
  totalCredits: number
  balanced: boolean
}

export interface BalanceSheetLine {
  accountId: string
  accountNumber: string
  accountName: string
  balance: number
}

export interface BalanceSheetSection {
  lines: BalanceSheetLine[]
  total: number
}

export interface BalanceSheet {
  currentAssets: BalanceSheetSection
  nonCurrentAssets: BalanceSheetSection
  currentLiabilities: BalanceSheetSection
  nonCurrentLiabilities: BalanceSheetSection
  retainedEquityAccounts: BalanceSheetSection
  assets: number
  liabilities: number
  retainedEquity: number
  netIncome: number
  equity: number
  balanced: boolean
}

export interface IncomeStatement {
  revenueLines: BalanceSheetLine[]
  expenseLines: BalanceSheetLine[]
  revenue: number
  expenses: number
  netIncome: number
}

export interface DatabaseSettings {
  type: 'sqlite' | 'postgresql'
  path: string | null
  sslEnabled: boolean
}

export interface DbStats {
  accounts: number
  postedEntries: number
  draftEntries: number
  fileSizeBytes: number | null
}

export interface ExportData {
  exportedAt: string
  version: string
  accounts: Account[]
  entries: JournalEntry[]
}

export interface ImportMapping {
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

// --- Recurring Templates ---

export interface RecurringLineInput {
  accountId: string
  type: 'debit' | 'credit'
  amount: number
}

export interface RecurringTemplateInput {
  name: string
  memo: string
  paymentMethod?: string
  schedule: 'weekly' | 'monthly' | 'quarterly' | 'annually' | 'custom'
  customCron?: string
  nextDue: string  // ISO date string
  autoPost: boolean
  lines: RecurringLineInput[]
}

export interface RecurringTemplate extends RecurringTemplateInput {
  id: string
  createdAt: string
  updatedAt: string
}

// In Electron the preload injects window.electronAPI.apiBaseUrl; in the Vite
// dev server all routes are proxied so an empty base (relative URL) works.
function getBaseUrl(): string {
  return window.electronAPI?.apiBaseUrl ?? ''
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const hasBody = options?.body !== undefined
  const res = await fetch(`${getBaseUrl()}${url}`, {
    headers: { ...(hasBody ? { 'Content-Type': 'application/json' } : {}), ...options?.headers },
    ...options,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || res.statusText)
  }
  if (res.status === 204) return undefined as unknown as T
  return res.json() as Promise<T>
}

export const api = {
  accounts: {
    list: (): Promise<Account[]> => request('/accounts'),
    create: (data: CreateAccountInput): Promise<Account> =>
      request('/accounts', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Account>): Promise<Account> =>
      request(`/accounts/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  },
  entries: {
    list: (params?: { from?: string; to?: string }): Promise<JournalEntry[]> => {
      const qs = params ? new URLSearchParams(
        Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ''))
      ).toString() : ''
      return request(`/entries${qs ? '?' + qs : ''}`)
    },
    listDrafts: (): Promise<JournalEntry[]> => request('/entries/drafts'),
    saveDraft: (data: DraftEntryInput): Promise<JournalEntry> =>
      request('/entries/draft', { method: 'POST', body: JSON.stringify(data) }),
    post: (id: string): Promise<JournalEntry> =>
      request('/entries/post', { method: 'POST', body: JSON.stringify({ id }) }),
    delete: (id: string): Promise<void> =>
      request(`/entries/${id}`, { method: 'DELETE' }),
    reverse: (id: string): Promise<JournalEntry> =>
      request(`/entries/${id}/reverse`, { method: 'POST' }),
  },
  reports: {
    trialBalance: (): Promise<TrialBalance> =>
      request('/reports/trial-balance'),
    balanceSheet: (asOf: string): Promise<BalanceSheet> =>
      request(`/reports/balance-sheet?asOf=${encodeURIComponent(asOf)}`),
    incomeStatement: (from: string, to: string): Promise<IncomeStatement> =>
      request(`/reports/income-statement?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
  },
  settings: {
    database: (): Promise<DatabaseSettings> => request('/settings/database'),
    stats: (): Promise<DbStats> => request('/settings/stats'),
    export: (): Promise<ExportData> => request('/settings/export'),
    wipe: (): Promise<{ wiped: boolean }> => request('/settings/wipe', { method: 'POST' }),
    import: (payload: {
      format: 'corebooks-json' | 'csv' | 'iif'
      data: string
      mapping?: ImportMapping
      options: ImportOptions
    }): Promise<ImportResult> =>
      request('/settings/import', { method: 'POST', body: JSON.stringify(payload) }),
  },
  recurring: {
    list: (): Promise<RecurringTemplate[]> => request('/recurring'),
    get: (id: string): Promise<RecurringTemplate> => request(`/recurring/${id}`),
    create: (input: RecurringTemplateInput): Promise<RecurringTemplate> =>
      request('/recurring', { method: 'POST', body: JSON.stringify(input) }),
    update: (id: string, input: Partial<RecurringTemplateInput>): Promise<RecurringTemplate> =>
      request(`/recurring/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    delete: (id: string): Promise<{ deleted: boolean }> =>
      request(`/recurring/${id}`, { method: 'DELETE' }),
  },
}

// --- Period Close ---

export interface PeriodConfig {
  fiscalYearEndMonth: number
  fiscalYearEndDay: number
  closeFrequency: 'year-end' | 'month-end'
  retainedEarningsAcctId: string | null
}

export interface ClosedPeriod {
  id: string
  year: number
  month: number
  closedAt: string
  entryId: string
}

export interface ClosingEntryResult {
  draftId: string
  year: number
  month: number
  netIncome: number
  lineCount: number
}

export interface PostClosingResult {
  entryId: string
  year: number
  month: number
}

export async function getPeriodConfig(): Promise<PeriodConfig> {
  return request('/periods/config')
}

export async function savePeriodConfig(data: PeriodConfig): Promise<PeriodConfig> {
  return request('/periods/config', { method: 'POST', body: JSON.stringify(data) })
}

export async function getClosedPeriods(): Promise<ClosedPeriod[]> {
  return request('/periods/closed')
}

export async function generateClosingEntry(year: number, month: number): Promise<ClosingEntryResult> {
  return request('/periods/generate-closing', { method: 'POST', body: JSON.stringify({ year, month }) })
}

export async function postClosingEntry(draftId: string, year: number, month: number): Promise<PostClosingResult> {
  return request('/periods/post-closing', { method: 'POST', body: JSON.stringify({ draftId, year, month }) })
}

// Standalone named exports for direct import in UI components
export async function listAccounts(): Promise<Account[]> {
  return api.accounts.list()
}

export async function listRecurringTemplates(): Promise<RecurringTemplate[]> {
  return api.recurring.list()
}

export async function createRecurringTemplate(input: RecurringTemplateInput): Promise<RecurringTemplate> {
  return api.recurring.create(input)
}

export async function updateRecurringTemplate(id: string, input: Partial<RecurringTemplateInput>): Promise<RecurringTemplate> {
  return api.recurring.update(id, input)
}

export async function deleteRecurringTemplate(id: string): Promise<void> {
  await api.recurring.delete(id)
}
