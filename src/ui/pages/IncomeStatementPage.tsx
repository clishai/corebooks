import { useState, useEffect, Fragment } from 'react'
import { api, IncomeStatement, BalanceSheetLine } from '../api/client'

function fmt(amount: number): string {
  if (amount < 0) {
    return `(${Math.abs(amount).toLocaleString('en-US', { style: 'currency', currency: 'USD' })})`
  }
  return amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

function currentYearRange(): { from: string; to: string } {
  const year = new Date().getFullYear()
  return { from: `${year}-01-01`, to: `${year}-12-31` }
}

const colChevron = 'w-8 text-center pl-2'
const colNumber  = 'w-24 px-2 font-mono text-xs'
const colName    = 'px-2'
const colAmount  = 'w-44 px-3 text-right font-mono text-sm'

interface AccountGroupProps {
  label: string
  lines: BalanceSheetLine[]
  total: number
  expanded: boolean
  onToggle: () => void
  subtotalLabel: string
  totalColor?: string
}

function AccountGroup({ label, lines, total, expanded, onToggle, subtotalLabel, totalColor = 'text-chalk' }: AccountGroupProps) {
  const hasLines = lines.length > 0
  return (
    <Fragment>
      <tr
        className={`border-b border-rim ${hasLines ? 'cursor-pointer hover:bg-raised/60' : ''} transition-colors`}
        onClick={hasLines ? onToggle : undefined}
      >
        <td className={`${colChevron} py-2.5 text-ash text-xs select-none`}>
          {hasLines ? (expanded ? '▾' : '▸') : ''}
        </td>
        <td className={`${colNumber} py-2.5 text-ash`}></td>
        <td className={`${colName} py-2.5 text-sm font-semibold text-chalk`}>{label}</td>
        <td className={`${colAmount} py-2.5 font-semibold ${total === 0 ? 'text-ash' : totalColor}`}>
          {total === 0 && !hasLines ? '—' : fmt(total)}
        </td>
      </tr>

      {expanded && lines.map((line) => (
        <tr key={line.accountId} className="border-b border-rim/60 bg-void/40">
          <td className={`${colChevron} py-2`}></td>
          <td className={`${colNumber} py-2 text-ash/70`}>{line.accountNumber}</td>
          <td className={`${colName} py-2 pl-7 text-sm text-ash`}>{line.accountName}</td>
          <td className={`${colAmount} py-2 ${line.balance < 0 ? 'text-red-400' : 'text-chalk/90'}`}>
            {fmt(line.balance)}
          </td>
        </tr>
      ))}

      {expanded && hasLines && (
        <tr className="border-b border-rim">
          <td className={`${colChevron} py-2`}></td>
          <td className={`${colNumber} py-2`}></td>
          <td className={`${colName} py-2 pl-7 text-xs text-ash uppercase tracking-wide`}>{subtotalLabel}</td>
          <td className={`${colAmount} py-2 ${totalColor} font-semibold border-t border-rim`}>{fmt(total)}</td>
        </tr>
      )}
    </Fragment>
  )
}

export default function IncomeStatementPage() {
  const { from: defaultFrom, to: defaultTo } = currentYearRange()
  const [from, setFrom] = useState(defaultFrom)
  const [to, setTo] = useState(defaultTo)
  const [report, setReport] = useState<IncomeStatement | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [openRev, setOpenRev] = useState(true)
  const [openExp, setOpenExp] = useState(true)

  function fetchReport(f: string, t: string) {
    if (!f || !t || f > t) return
    setLoading(true)
    setError(null)
    api.reports
      .incomeStatement(f, t)
      .then(setReport)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load report.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchReport(from, to) }, [])

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
        <div>
          <h1 className="text-xl font-semibold text-chalk">Income Statement</h1>
          <p className="text-sm text-ash mt-1">Revenue, expenses, and net income for a period.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <label className="text-xs font-medium text-ash">From</label>
          <input
            type="date" value={from}
            onChange={(e) => { setFrom(e.target.value); fetchReport(e.target.value, to) }}
            className="bg-raised border border-rim text-chalk rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neon"
          />
          <label className="text-xs font-medium text-ash">To</label>
          <input
            type="date" value={to}
            onChange={(e) => { setTo(e.target.value); fetchReport(from, e.target.value) }}
            className="bg-raised border border-rim text-chalk rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neon"
          />
        </div>
      </div>

      {from > to && (
        <div className="text-sm text-amber-300 bg-amber-950/50 border border-amber-800 px-4 py-3 rounded-sm mb-4">
          The start date must be before or equal to the end date.
        </div>
      )}

      {loading && <p className="text-sm text-ash">Loading…</p>}
      {error && (
        <div className="text-sm text-red-300 bg-red-950/50 border border-red-800 px-4 py-3 rounded-sm">
          {error}
        </div>
      )}

      {report && !loading && (
        <div className="max-w-2xl">
          <div className="border border-rim rounded-sm overflow-hidden">
            <table className="w-full text-sm border-collapse">

              {/* Section label */}
              <thead>
                <tr className="bg-void border-b border-rim">
                  <th colSpan={4} className="px-3 py-2 text-left text-xs font-bold text-neon uppercase tracking-widest">
                    Income Statement
                  </th>
                </tr>
              </thead>

              <tbody>
                {/* Revenue */}
                <AccountGroup
                  label="Revenue"
                  lines={report.revenueLines}
                  total={report.revenue}
                  expanded={openRev}
                  onToggle={() => setOpenRev((v) => !v)}
                  subtotalLabel="Total Revenue"
                  totalColor="text-emerald-400"
                />

                {/* Expenses */}
                <AccountGroup
                  label="Expenses"
                  lines={report.expenseLines}
                  total={report.expenses}
                  expanded={openExp}
                  onToggle={() => setOpenExp((v) => !v)}
                  subtotalLabel="Total Expenses"
                  totalColor="text-amber-400"
                />

                {/* Net income grand total */}
                <tr className="bg-raised border-t-2 border-rim">
                  <td className={`${colChevron} py-3`}></td>
                  <td className={`${colNumber} py-3`}></td>
                  <td className={`${colName} py-3 text-sm font-bold text-chalk uppercase tracking-wide`}>Net Income</td>
                  <td className={`${colAmount} py-3 font-bold text-base ${report.netIncome < 0 ? 'text-red-400' : 'text-neon'}`}>
                    {fmt(report.netIncome)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {report.netIncome < 0 && (
            <div className="text-sm text-amber-300 bg-amber-950/50 border border-amber-800 px-4 py-3 rounded-sm mt-3">
              Net income is negative — expenses exceed revenue for this period.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
