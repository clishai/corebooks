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
  {
    id: 'general-ledger',
    label: 'General Ledger',
    path: '/reports/general-ledger',
    description: 'Line-by-line posted activity across every account.',
  },
  {
    id: 'account-activity',
    label: 'Account Activity',
    path: '/reports/account-activity',
    description: 'Running activity for a selected account.',
  },
  {
    id: 'cash-flow',
    label: 'Cash Flow Snapshot',
    path: '/reports/cash-flow',
    description: 'Net movement across cash and bank-like asset accounts.',
  },
]
