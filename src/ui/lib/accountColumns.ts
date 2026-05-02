export type AccountColumnId = 'type' | 'normalBalance' | 'contra' | 'classification' | 'balance'

export interface AccountColumnDef {
  id: AccountColumnId
  label: string
}

export const ALL_ACCOUNT_COLUMNS: AccountColumnDef[] = [
  { id: 'type',           label: 'Type' },
  { id: 'normalBalance',  label: 'Normal Balance' },
  { id: 'contra',         label: 'Contra?' },
  { id: 'classification', label: 'Classification' },
  { id: 'balance',        label: 'Current Balance' },
]

const DEFAULT_COLUMNS: AccountColumnId[] = ['type', 'normalBalance', 'contra', 'classification', 'balance']
const STORAGE_KEY = 'cb_accounts_columns'

export function getVisibleColumns(): AccountColumnId[] {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return DEFAULT_COLUMNS
  try {
    return JSON.parse(raw) as AccountColumnId[]
  } catch {
    return DEFAULT_COLUMNS
  }
}

export function saveVisibleColumns(ids: AccountColumnId[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ids))
}
