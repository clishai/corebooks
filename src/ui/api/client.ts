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

export interface VaultHealth {
  databasePath: string | null
  fileSizeBytes: number | null
  accounts: number
  postedEntries: number
  draftEntries: number
  lastBackupAt: string | null
  generatedAt: string
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

export interface AuditEvent {
  id: string
  action: string
  entityType: string
  entityId: string | null
  detail: Record<string, unknown> | null
  createdAt: string
}

export interface PluginCategory {
  id: string
  name: string
  description: string
  permissions: string[]
  enabled: boolean
  builtIn: boolean
}

export interface BankRule {
  id: string
  name: string
  priority: number
  enabled: boolean
  matchField: 'payee' | 'memo' | 'amount'
  matchType: 'contains' | 'startsWith' | 'equals'
  pattern: string
  accountId?: string | null
  entryType: 'expense' | 'income' | 'transfer'
  memo?: string | null
  paymentMethod?: string | null
}

export type BankRuleInput = Omit<BankRule, 'id'>

export interface BankFeedImportResult {
  draftsCreated: number
  rowsSkipped: number
  warnings: string[]
}

export interface ReconciliationSession {
  id: string
  accountId: string
  statementDate: string
  endingBalance: number
  status: string
  notes: string | null
  clearedBalance: number
  difference: number
  itemCount: number
  clearedCount: number
  createdAt: string
  updatedAt: string
}

export interface ReconciliationItem {
  entryId: string
  date: string
  memo: string
  amount: number
  cleared: boolean
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
    generalLedger: (params?: { from?: string; to?: string }): Promise<Array<Record<string, unknown>>> => {
      const qs = params ? new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v))).toString() : ''
      return request(`/reports/general-ledger${qs ? '?' + qs : ''}`)
    },
    accountActivity: (accountId: string, params?: { from?: string; to?: string }): Promise<Array<Record<string, unknown>>> => {
      const query = new URLSearchParams({ accountId, ...Object.fromEntries(Object.entries(params ?? {}).filter(([, v]) => v)) })
      return request(`/reports/account-activity?${query.toString()}`)
    },
    cashFlow: (params?: { from?: string; to?: string }): Promise<{ netCash: number; cashAccountIds: string[]; entryCount: number }> => {
      const qs = params ? new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v))).toString() : ''
      return request(`/reports/cash-flow${qs ? '?' + qs : ''}`)
    },
  },
  settings: {
    database: (): Promise<DatabaseSettings> => request('/settings/database'),
    stats: (): Promise<DbStats> => request('/settings/stats'),
    vaultHealth: (): Promise<VaultHealth> => request('/settings/vault-health'),
    appSettings: (): Promise<Record<string, unknown>> => request('/settings/app-settings'),
    saveAppSettings: (data: Record<string, unknown>): Promise<Record<string, unknown>> =>
      request('/settings/app-settings', { method: 'POST', body: JSON.stringify(data) }),
    export: (): Promise<ExportData> => request('/settings/export'),
    backup: (): Promise<ExportData & { backup: true }> => request('/settings/backup'),
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
  audit: {
    list: (limit = 100): Promise<AuditEvent[]> => request(`/audit?limit=${limit}`),
  },
  plugins: {
    categories: (): Promise<PluginCategory[]> => request('/plugins/categories'),
    setCategoryEnabled: (id: string, enabled: boolean): Promise<PluginCategory> =>
      request(`/plugins/categories/${id}`, { method: 'PATCH', body: JSON.stringify({ enabled }) }),
  },
  bankFeed: {
    rules: (): Promise<BankRule[]> => request('/bank-feed/rules'),
    templates: (): Promise<Array<Omit<BankRuleInput, 'accountId'>>> => request('/bank-feed/rule-templates'),
    createRule: (input: BankRuleInput): Promise<BankRule> =>
      request('/bank-feed/rules', { method: 'POST', body: JSON.stringify(input) }),
    updateRule: (id: string, input: BankRuleInput): Promise<BankRule> =>
      request(`/bank-feed/rules/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    deleteRule: (id: string): Promise<void> => request(`/bank-feed/rules/${id}`, { method: 'DELETE' }),
    importCsv: (data: string, bankAccountId: string): Promise<BankFeedImportResult> =>
      request('/bank-feed/import-csv', { method: 'POST', body: JSON.stringify({ data, bankAccountId }) }),
  },
  reconciliation: {
    sessions: (): Promise<ReconciliationSession[]> => request('/reconciliation/sessions'),
    createSession: (input: { accountId: string; statementDate: string; endingBalance: number; notes?: string }): Promise<ReconciliationSession> =>
      request('/reconciliation/sessions', { method: 'POST', body: JSON.stringify(input) }),
    getSession: (id: string): Promise<ReconciliationSession> => request(`/reconciliation/sessions/${id}`),
    items: (id: string): Promise<ReconciliationItem[]> => request(`/reconciliation/sessions/${id}/items`),
    setItem: (id: string, entryId: string, cleared: boolean): Promise<ReconciliationSession> =>
      request(`/reconciliation/sessions/${id}/items`, { method: 'POST', body: JSON.stringify({ entryId, cleared }) }),
    close: (id: string): Promise<ReconciliationSession> =>
      request(`/reconciliation/sessions/${id}/close`, { method: 'POST' }),
    delete: (id: string): Promise<void> => request(`/reconciliation/sessions/${id}`, { method: 'DELETE' }),
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
