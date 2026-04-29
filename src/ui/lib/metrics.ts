export type MetricId =
  | 'cash_balance'
  | 'total_assets'
  | 'total_liabilities'
  | 'total_equity'
  | 'net_income_30d'
  | 'gross_revenue_30d'
  | 'total_expenses_30d'
  | 'net_income_ytd'
  | 'gross_revenue_ytd'
  | 'total_expenses_ytd'

export interface MetricDef {
  id: MetricId
  label: string
}

export const ALL_METRICS: MetricDef[] = [
  { id: 'cash_balance',       label: 'Cash & Bank Balance' },
  { id: 'total_assets',       label: 'Total Assets' },
  { id: 'total_liabilities',  label: 'Total Liabilities' },
  { id: 'total_equity',       label: 'Total Equity' },
  { id: 'net_income_30d',     label: 'Net Income (last 30 days)' },
  { id: 'gross_revenue_30d',  label: 'Gross Revenue (last 30 days)' },
  { id: 'total_expenses_30d', label: 'Total Expenses (last 30 days)' },
  { id: 'net_income_ytd',     label: 'Net Income (year to date)' },
  { id: 'gross_revenue_ytd',  label: 'Gross Revenue (year to date)' },
  { id: 'total_expenses_ytd', label: 'Total Expenses (year to date)' },
]

export const DEFAULT_METRICS: MetricId[] = ['cash_balance', 'net_income_30d', 'gross_revenue_30d']

const STORAGE_KEY = 'cb_home_metrics'

export function getSelectedMetrics(): MetricId[] {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return DEFAULT_METRICS
  try {
    return JSON.parse(raw) as MetricId[]
  } catch {
    return DEFAULT_METRICS
  }
}

export function saveSelectedMetrics(ids: MetricId[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ids))
}

export type HomeLayout = 'compact' | 'comfortable'

const LAYOUT_KEY = 'cb_home_layout'

export function getHomeLayout(): HomeLayout {
  const raw = localStorage.getItem(LAYOUT_KEY)
  return raw === 'compact' ? 'compact' : 'comfortable'
}

export function saveHomeLayout(layout: HomeLayout): void {
  localStorage.setItem(LAYOUT_KEY, layout)
}
