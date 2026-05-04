import { useState, useEffect, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { api, TrialBalanceRow, JournalEntry, Account } from '../api/client'
import { MetricId, MetricDef, ALL_METRICS, getSelectedMetrics, getHomeLayout, HomeLayout } from '../lib/metrics'
import { isDismissed, dismissAlert, AlertId } from '../lib/alerts'

const WELCOME_MESSAGES = [
  'welcome back!',
  'another day, another debit.',
  'good to see you.',
  "closed-source software is the biggest liability.",
  'the books await.',
  'debits on the left, always.',
  'everyone can be an accountant.',
  "so we beat on, boats against the current.",
  'account for your excellence.',
  "let's balance the books.",
  'proof of work.',
  'an entry per day keeps the doctor away.',
  'every transaction tells a story.',
  'your ledger is looking good.',
  'accountants are horrible liars.',
  "from stone tablets to open-source.",
  'assets, liabilities, and you.',
  "don't let front-end work become month-end work.",
  "to account or not to account?",
  'time to make the numbers talk.',
  'the trial balance never lies.',
  'credits where credits are due.',
  'double-entry, single focus.',
  'good books make good business.',
  "credits are always right (and on the right).",
  'ready to reconcile?',
  'keeping the equation balanced.',
  'time to hit the books.',
  "revenue minus expenses — let's see where we land.",
  'equity is the goal.',
  'alliteration and accounting are awesome.',
  "let's see what the numbers say today.",
  'a clean ledger is a happy ledger.',
  "thank you, pacioli.",
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

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
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

function MetricCard({
  id,
  data,
  layout,
}: {
  id: MetricId
  data: MetricData | undefined
  layout: HomeLayout
}) {
  const def = ALL_METRICS.find((m): m is MetricDef => m.id === id)!
  const loading = data === undefined

  const cardClass =
    layout === 'compact'
      ? 'bg-surface border border-rim rounded-xl px-4 py-3 flex flex-col gap-1.5 w-44 shrink-0'
      : 'bg-surface border border-rim rounded-xl px-5 py-4 flex flex-col gap-2 w-64 shrink-0'

  const valueSize = layout === 'compact' ? 'text-lg' : 'text-xl'

  return (
    <div className={cardClass}>
      <span className="text-[11px] text-ash font-semibold uppercase tracking-wide leading-tight">
        {def.label}
      </span>

      {loading ? (
        <span className={`text-chalk ${valueSize} font-bold animate-pulse`}>—</span>
      ) : (
        <>
          <span className={`${valueSize} font-bold ${valueColor(id, data.current)}`}>
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

function AlertBanner({
  message,
  onDismiss,
}: {
  message: string
  onDismiss: () => void
}) {
  return (
    <div className="flex items-center justify-between bg-amber-950/40 border border-amber-800/50 rounded-lg px-4 py-3 gap-4">
      <p className="text-sm text-amber-300">{message}</p>
      <button
        onClick={onDismiss}
        className="text-xs font-medium text-amber-600 hover:text-amber-400 transition-colors shrink-0"
      >
        Dismiss
      </button>
    </div>
  )
}

function RecentEntrySection({
  entry,
  accountMap,
  loading,
}: {
  entry: JournalEntry | null
  accountMap: Map<string, Account>
  loading: boolean
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold text-ash uppercase tracking-wide">
          Most Recent Entry
        </h2>
        <Link to="/entries" className="text-xs text-neon hover:underline">
          view all →
        </Link>
      </div>

      {loading ? (
        <div className="bg-surface border border-rim rounded-xl px-5 py-4">
          <span className="text-sm text-ash animate-pulse">Loading…</span>
        </div>
      ) : !entry ? (
        <div className="bg-surface border border-rim rounded-xl px-5 py-8 text-center">
          <p className="text-sm text-ash">
            No posted entries yet.{' '}
            <span className="text-chalk">Post your first journal entry</span> to see it here.
          </p>
        </div>
      ) : (
        <div className="bg-surface border border-rim rounded-xl p-5 space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-base font-semibold text-chalk">
                {entry.memo.trim() ? entry.memo : <span className="text-ash italic font-normal">No memo</span>}
              </p>
              <p className="text-xs text-ash mt-0.5">{formatDate(entry.date)}</p>
            </div>
            {entry.paymentMethod ? (
              <span className="text-xs text-ash bg-raised border border-rim px-2 py-0.5 rounded shrink-0">
                {entry.paymentMethod}
              </span>
            ) : (
              <span className="text-xs text-ash/50 italic shrink-0">adjustment</span>
            )}
          </div>

          <div className="border-t border-rim pt-3">
            <table className="w-full text-xs">
              <tbody>
                {entry.lines.slice(0, 4).map((line, i) => {
                  const account = accountMap.get(line.accountId)
                  return (
                    <tr key={i}>
                      <td className="py-0.5 pr-3">
                        <span className="text-chalk">{account?.name ?? line.accountId}</span>
                        {account && (
                          <span className="ml-1.5 text-ash">({account.number})</span>
                        )}
                      </td>
                      <td className="py-0.5 text-right w-28 tabular-nums">
                        <span className={line.type === 'debit' ? 'text-chalk' : 'text-ash'}>
                          {fmt(line.amount)}
                        </span>
                      </td>
                      <td className="py-0.5 pl-3 w-8 text-ash text-right">
                        {line.type === 'debit' ? 'Dr' : 'Cr'}
                      </td>
                    </tr>
                  )
                })}
                {entry.lines.length > 4 && (
                  <tr>
                    <td colSpan={3} className="pt-1.5 text-ash text-[10px]">
                      +{entry.lines.length - 4} more line{entry.lines.length - 4 > 1 ? 's' : ''}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

export default function HomePage() {
  const [message] = useState(
    () => WELCOME_MESSAGES[Math.floor(Math.random() * WELCOME_MESSAGES.length)],
  )
  const [selectedMetrics] = useState(getSelectedMetrics)
  const [homeLayout] = useState<HomeLayout>(getHomeLayout)
  const [metricValues, setMetricValues] = useState<MetricValues>({})

  const [recentEntry, setRecentEntry] = useState<JournalEntry | null>(null)
  const [recentEntryLoading, setRecentEntryLoading] = useState(true)
  const [accountMap, setAccountMap] = useState<Map<string, Account>>(new Map())

  const [draftsCount, setDraftsCount] = useState(0)
  const [memosMissingCount, setMemosMissingCount] = useState(0)
  const [draftsAlertVisible, setDraftsAlertVisible] = useState(() => !isDismissed('drafts'))
  const [memosAlertVisible, setMemosAlertVisible] = useState(() => !isDismissed('memos'))

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

  useEffect(() => {
    Promise.all([api.entries.list(), api.accounts.list(), api.entries.listDrafts()])
      .then(([entries, accounts, drafts]) => {
        setRecentEntry(entries.length > 0 ? entries[entries.length - 1] : null)

        const map = new Map<string, Account>()
        accounts.forEach((a) => map.set(a.id, a))
        setAccountMap(map)

        setDraftsCount(drafts.length)
        setMemosMissingCount(entries.filter((e) => !e.memo.trim()).length)
      })
      .catch(() => setRecentEntry(null))
      .finally(() => setRecentEntryLoading(false))
  }, [])

  function handleDismiss(id: AlertId) {
    dismissAlert(id)
    if (id === 'drafts') setDraftsAlertVisible(false)
    else setMemosAlertVisible(false)
  }

  const showDraftsAlert = draftsCount > 0 && draftsAlertVisible
  const showMemosAlert = memosMissingCount > 0 && memosAlertVisible

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-chalk lowercase">{message}</h1>

      {(showDraftsAlert || showMemosAlert) && (
        <div className="space-y-2">
          {showDraftsAlert && (
            <AlertBanner
              message={`You have ${draftsCount} unsaved draft${draftsCount !== 1 ? 's' : ''}. Open Drafts to review or post them.`}
              onDismiss={() => handleDismiss('drafts')}
            />
          )}
          {showMemosAlert && (
            <AlertBanner
              message={`${memosMissingCount} posted entr${memosMissingCount !== 1 ? 'ies are' : 'y is'} missing a memo. Adding memos improves your audit trail.`}
              onDismiss={() => handleDismiss('memos')}
            />
          )}
        </div>
      )}

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
            <MetricCard key={id} id={id} data={metricValues[id]} layout={homeLayout} />
          ))}
        </div>
      )}

      <RecentEntrySection
        entry={recentEntry}
        accountMap={accountMap}
        loading={recentEntryLoading}
      />
    </div>
  )
}
