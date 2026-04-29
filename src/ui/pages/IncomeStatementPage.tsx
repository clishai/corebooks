import { useState, useEffect } from 'react'
import { api, IncomeStatement } from '../api/client'

function fmt(amount: number): string {
  return amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

function currentYearRange(): { from: string; to: string } {
  const year = new Date().getFullYear()
  return { from: `${year}-01-01`, to: `${year}-12-31` }
}

export default function IncomeStatementPage() {
  const { from: defaultFrom, to: defaultTo } = currentYearRange()
  const [from, setFrom] = useState(defaultFrom)
  const [to, setTo] = useState(defaultTo)
  const [report, setReport] = useState<IncomeStatement | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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

  useEffect(() => {
    fetchReport(from, to)
  }, [])

  function handleFromChange(e: React.ChangeEvent<HTMLInputElement>) {
    setFrom(e.target.value)
    fetchReport(e.target.value, to)
  }

  function handleToChange(e: React.ChangeEvent<HTMLInputElement>) {
    setTo(e.target.value)
    fetchReport(from, e.target.value)
  }

  const isProfit = report ? report.netIncome >= 0 : true

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
            type="date"
            value={from}
            onChange={handleFromChange}
            className="bg-raised border border-rim text-chalk rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neon"
          />
          <label className="text-xs font-medium text-ash">To</label>
          <input
            type="date"
            value={to}
            onChange={handleToChange}
            className="bg-raised border border-rim text-chalk rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neon"
          />
        </div>
      </div>

      {from > to && (
        <div className="text-sm text-amber-300 bg-amber-950/50 border border-amber-800 px-4 py-3 rounded-md mb-4">
          The start date must be before or equal to the end date.
        </div>
      )}

      {loading && <p className="text-sm text-ash">Loading…</p>}

      {error && (
        <div className="text-sm text-red-300 bg-red-950/50 border border-red-800 px-4 py-3 rounded-md">
          {error}
        </div>
      )}

      {report && !loading && (
        <div className="max-w-md">
          <div className="bg-surface rounded-lg border border-rim overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-rim hover:bg-raised transition-colors">
              <span className="text-sm font-medium text-ash">Revenue</span>
              <span className="font-mono text-chalk font-semibold">{fmt(report.revenue)}</span>
            </div>
            <div className="flex items-center justify-between px-5 py-4 border-b border-rim hover:bg-raised transition-colors">
              <span className="text-sm font-medium text-ash">Expenses</span>
              <span className="font-mono text-chalk font-semibold">{fmt(report.expenses)}</span>
            </div>

            {/* Net income */}
            <div className="flex items-center justify-between px-5 py-4 bg-raised border-t-2 border-rim">
              <span className="text-sm font-semibold text-chalk">Net Income</span>
              <span
                className={`font-mono font-bold text-base ${
                  isProfit ? 'text-emerald-400' : 'text-red-400'
                }`}
              >
                {fmt(report.netIncome)}
              </span>
            </div>
          </div>

          {!isProfit && (
            <div className="text-sm text-amber-300 bg-amber-950/50 border border-amber-800 px-4 py-3 rounded-md mt-4">
              Net income is negative — expenses exceed revenue for this period.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
