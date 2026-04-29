import { useState, useEffect, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { api, TrialBalanceRow } from '../api/client'
import { MetricId, MetricDef, ALL_METRICS, getSelectedMetrics } from '../lib/metrics'

const WELCOME_MESSAGES = [
  'welcome back!',
  'another day, another debit!',
  'good to see you.',
  'the books await.',
  'debits on the left, always.',
  "let's balance the books.",
  'every transaction tells a story.',
  'your ledger is looking good.',
  'assets, liabilities, and you.',
  'time to make the numbers talk.',
  'the trial balance never lies.',
  'credits where credits are due.',
  'double-entry, single focus.',
  'good books make good business.',
  'ready to reconcile?',
  'keeping the equation balanced.',
  "revenue minus expenses — let's see where we land.",
  'equity is the goal.',
  "let's see what the numbers say today.",
  'a clean ledger is a happy ledger.',
]

function toDateStr(d: Date): string {
  return d.toISOString().split('T')[0]
}

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return toDateStr(d)
}

function startOfYear(): string {
  return `${new Date().getFullYear()}-01-01`
}

function startOfLastYear(): string {
  return `${new Date().getFullYear() - 1}-01-01`
}

function endOfLastYear(): string {
  return `${new Date().getFullYear() - 1}-12-31`
}

function fmt(val: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val)
}

function extractCashBalance(rows: TrialBalanceRow[]): number {
  return rows
    .filter((r) => {
      const name = r.account.name.toLowerCase()
      return r.account.type === 'Asset' && (name.includes('cash') || name.includes('bank'))
    })
    .reduce((sum, r) => sum + r.debit - r.credit, 0)
}

interface MetricData {
  current: number
  previous: number | null
}

type MetricValues = Partial<Record<MetricId, MetricData>>

function valueColor(id: MetricId, val: number): string {
  const isExpense = id === 'total_expenses_30d' || id === 'total_expenses_ytd'
  const isLiability = id === 'total_liabilities'
  if (isExpense || isLiability) {
    return val > 0 ? 'text-red-400' : 'text-chalk'
  }
  if (val > 0) return 'text-emerald-400'
  if (val < 0) return 'text-red-400'
  return 'text-chalk'
}

function ChangeTag({ diff }: { diff: number }): ReactNode {
  if (diff > 0) return <span className="text-emerald-400 text-xs font-medium">▲ {fmt(diff)}</span>
  if (diff < 0) return <span className="text-red-400 text-xs font-medium">▼ {fmt(Math.abs(diff))}</span>
  return <span className="text-ash text-xs">—</span>
}

function MetricCard({ id, data }: { id: MetricId; data: MetricData | undefined }) {
  const def = ALL_METRICS.find((m): m is MetricDef => m.id === id)!
  const loading = data === undefined

  return (
    <div className="bg-surface border border-rim rounded-xl px-5 py-4 flex flex-col gap-2 w-52 shrink-0">
      <span className="text-[11px] text-ash font-semibold uppercase tracking-wide leading-tight">
        {def.label}
      </span>

      {loading ? (
        <span className="text-chalk text-xl font-bold animate-pulse">—</span>
      ) : (
        <>
          <span className={`text-xl font-bold ${valueColor(id, data.current)}`}>
            {fmt(data.current)}
          </span>
          {data.previous !== null && (
            <div className="flex items-center gap-1.5">
              <ChangeTag diff={data.current - data.previous} />
              <span className="text-ash text-[10px]">vs prior period</span>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default function HomePage() {
  const [message] = useState(
    () => WELCOME_MESSAGES[Math.floor(Math.random() * WELCOME_MESSAGES.length)],
  )
  const [selectedMetrics] = useState(getSelectedMetrics)
  const [metricValues, setMetricValues] = useState<MetricValues>({})

  useEffect(() => {
    const todayStr = toDateStr(new Date())
    const t30 = daysAgo(30)
    const t60 = daysAgo(60)
    const ytd = startOfYear()
    const ly0 = startOfLastYear()
    const ly1 = endOfLastYear()

    const needsBalance = selectedMetrics.some((m) =>
      ['total_assets', 'total_liabilities', 'total_equity'].includes(m),
    )
    const needs30 = selectedMetrics.some((m) =>
      ['net_income_30d', 'gross_revenue_30d', 'total_expenses_30d'].includes(m),
    )
    const needsYtd = selectedMetrics.some((m) =>
      ['net_income_ytd', 'gross_revenue_ytd', 'total_expenses_ytd'].includes(m),
    )
    const needsCash = selectedMetrics.includes('cash_balance')

    const result: MetricValues = {}
    const fetches: Promise<void>[] = []

    if (needsBalance) {
      fetches.push(
        Promise.all([
          api.reports.balanceSheet(todayStr),
          api.reports.balanceSheet(t30),
        ])
          .then(([cur, prev]) => {
            result.total_assets = { current: cur.assets, previous: prev.assets }
            result.total_liabilities = { current: cur.liabilities, previous: prev.liabilities }
            result.total_equity = { current: cur.equity, previous: prev.equity }
          })
          .catch(() => {
            result.total_assets = { current: 0, previous: null }
            result.total_liabilities = { current: 0, previous: null }
            result.total_equity = { current: 0, previous: null }
          }),
      )
    }

    if (needs30) {
      fetches.push(
        Promise.all([
          api.reports.incomeStatement(t30, todayStr),
          api.reports.incomeStatement(t60, t30),
        ])
          .then(([cur, prev]) => {
            result.net_income_30d = { current: cur.netIncome, previous: prev.netIncome }
            result.gross_revenue_30d = { current: cur.revenue, previous: prev.revenue }
            result.total_expenses_30d = { current: cur.expenses, previous: prev.expenses }
          })
          .catch(() => {
            result.net_income_30d = { current: 0, previous: null }
            result.gross_revenue_30d = { current: 0, previous: null }
            result.total_expenses_30d = { current: 0, previous: null }
          }),
      )
    }

    if (needsYtd) {
      fetches.push(
        Promise.all([
          api.reports.incomeStatement(ytd, todayStr),
          api.reports.incomeStatement(ly0, ly1),
        ])
          .then(([cur, prev]) => {
            result.net_income_ytd = { current: cur.netIncome, previous: prev.netIncome }
            result.gross_revenue_ytd = { current: cur.revenue, previous: prev.revenue }
            result.total_expenses_ytd = { current: cur.expenses, previous: prev.expenses }
          })
          .catch(() => {
            result.net_income_ytd = { current: 0, previous: null }
            result.gross_revenue_ytd = { current: 0, previous: null }
            result.total_expenses_ytd = { current: 0, previous: null }
          }),
      )
    }

    if (needsCash) {
      fetches.push(
        api.reports
          .trialBalance()
          .then((tb) => {
            result.cash_balance = { current: extractCashBalance(tb.rows), previous: null }
          })
          .catch(() => {
            result.cash_balance = { current: 0, previous: null }
          }),
      )
    }

    Promise.all(fetches).then(() => setMetricValues({ ...result }))
  }, [selectedMetrics])

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-chalk lowercase">{message}</h1>

      {selectedMetrics.length === 0 ? (
        <p className="text-sm text-ash">
          no metrics selected.{' '}
          <Link to="/settings" className="text-neon hover:underline">
            settings → home page
          </Link>{' '}
          to choose some.
        </p>
      ) : (
        <div className="flex flex-wrap gap-4">
          {selectedMetrics.map((id) => (
            <MetricCard key={id} id={id} data={metricValues[id]} />
          ))}
        </div>
      )}
    </div>
  )
}
