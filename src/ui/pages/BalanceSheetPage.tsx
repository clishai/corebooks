import { useState, useEffect } from 'react'
import { api, BalanceSheet } from '../api/client'

function fmt(amount: number): string {
  return amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

export default function BalanceSheetPage() {
  const [asOf, setAsOf] = useState(todayISO())
  const [report, setReport] = useState<BalanceSheet | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  function fetchReport(date: string) {
    setLoading(true)
    setError(null)
    api.reports
      .balanceSheet(date)
      .then(setReport)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load report.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchReport(asOf)
  }, [])

  function handleDateChange(e: React.ChangeEvent<HTMLInputElement>) {
    setAsOf(e.target.value)
    if (e.target.value) fetchReport(e.target.value)
  }

  const rows: { label: string; value: number; accent?: boolean }[] = report
    ? [
        { label: 'Assets', value: report.assets },
        { label: 'Liabilities', value: report.liabilities },
        { label: 'Equity', value: report.equity },
      ]
    : []

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
        <div>
          <h1 className="text-xl font-semibold text-chalk">Balance Sheet</h1>
          <p className="text-sm text-ash mt-1">Assets, liabilities, and equity as of a date.</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-ash">As of</label>
          <input
            type="date"
            value={asOf}
            onChange={handleDateChange}
            className="bg-raised border border-rim text-chalk rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neon"
          />
        </div>
      </div>

      {loading && <p className="text-sm text-ash">Loading…</p>}

      {error && (
        <div className="text-sm text-red-300 bg-red-950/50 border border-red-800 px-4 py-3 rounded-md">
          {error}
        </div>
      )}

      {report && !loading && (
        <div className="max-w-md">
          <div className="bg-surface rounded-lg border border-rim overflow-hidden">
            {rows.map((row, i) => (
              <div
                key={row.label}
                className={`flex items-center justify-between px-5 py-4 ${
                  i < rows.length - 1 ? 'border-b border-rim' : ''
                } hover:bg-raised transition-colors`}
              >
                <span className="text-sm font-medium text-ash">{row.label}</span>
                <span className="font-mono text-chalk font-semibold">{fmt(row.value)}</span>
              </div>
            ))}

            {/* Divider and equation check */}
            <div className="border-t-2 border-rim bg-raised px-5 py-4 flex items-center justify-between">
              <span className="text-xs text-ash">
                Assets = Liabilities + Equity
              </span>
              {report.balanced ? (
                <span className="text-xs font-semibold text-emerald-400">✓ Balanced</span>
              ) : (
                <span className="text-xs font-semibold text-red-400">✗ Out of balance</span>
              )}
            </div>
          </div>

          {!report.balanced && (
            <div className="text-sm text-amber-300 bg-amber-950/50 border border-amber-800 px-4 py-3 rounded-md mt-4">
              The accounting equation does not hold for this date. This may indicate unposted
              or reversed entries that need review.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
