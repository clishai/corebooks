// src/ui/lib/reports.ts

export interface ReportMeta {
  id: string
  label: string
  path: string
  description: string
}

export const ALL_REPORTS: ReportMeta[] = [
  {
    id: 'trial-balance',
    label: 'Trial Balance',
    path: '/reports/trial-balance',
    description: 'Sum of all debit and credit balances. Confirms the ledger is balanced.',
  },
  {
    id: 'balance-sheet',
    label: 'Balance Sheet',
    path: '/reports/balance-sheet',
    description: 'Assets, liabilities, and equity as of a specific date.',
  },
  {
    id: 'income-statement',
    label: 'Income Statement',
    path: '/reports/income-statement',
    description: 'Revenue and expenses over a date range. Shows net income.',
  },
]
