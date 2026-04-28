export type AccountType = 'Asset' | 'Liability' | 'Equity' | 'Revenue' | 'Expense'

export interface Account {
  id: string
  number: string
  name: string
  type: AccountType
  normalBalance: 'debit' | 'credit'
  isContra: boolean
  contraTo?: AccountType
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

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
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
    list: (): Promise<JournalEntry[]> => request('/entries'),
    saveDraft: (data: DraftEntryInput): Promise<JournalEntry> =>
      request('/entries/draft', { method: 'POST', body: JSON.stringify(data) }),
    post: (id: string): Promise<JournalEntry> =>
      request('/entries/post', { method: 'POST', body: JSON.stringify({ id }) }),
    delete: (id: string): Promise<void> =>
      request(`/entries/${id}`, { method: 'DELETE' }),
  },
}
