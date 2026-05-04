import { useState, useEffect, Fragment } from 'react'
import { api, TrialBalance } from '../api/client'

function fmt(amount: number): string {
  return amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

const TYPE_ORDER = ['Asset', 'Liability', 'Equity', 'Revenue', 'Expense']

export default function TrialBalancePage() {
  const [report, setReport] = useState<TrialBalance | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.reports
      .trialBalance()
      .then(setReport)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load report.'))
      .finally(() => setLoading(false))
  }, [])

  // Group rows by account type for section rendering
  const grouped = report
    ? TYPE_ORDER.map((type) => ({
        type,
        rows: report.rows.filter((r) => r.account.type === type),
      })).filter((g) => g.rows.length > 0)
    : []

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-chalk">Trial Balance</h1>
        <p className="text-sm text-ash mt-1">Current balances across all accounts.</p>
      </div>

      {loading && <p className="text-sm text-ash">Loading…</p>}
      {error && (
        <div className="text-sm text-red-300 bg-red-950/50 border border-red-800 px-4 py-3 rounded-sm">
          {error}
        </div>
      )}

      {report && (
        <>
          {!report.balanced && (
            <div className="text-sm text-amber-300 bg-amber-950/50 border border-amber-800 px-4 py-3 rounded-sm mb-4">
              Ledger is out of balance. Total debits and credits do not match.
            </div>
          )}

          <div className="border border-rim rounded-sm overflow-hidden max-w-2xl">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-void border-b border-rim">
                  <th colSpan={4} className="px-3 py-2 text-left text-xs font-bold text-neon uppercase tracking-widest">
                    Trial Balance
                  </th>
                </tr>
                <tr className="bg-raised border-b border-rim">
                  <th className="text-left px-3 py-2.5 font-medium text-ash w-24 text-xs uppercase tracking-wide">No.</th>
                  <th className="text-left px-3 py-2.5 font-medium text-ash text-xs uppercase tracking-wide">Account</th>
                  <th className="text-right px-3 py-2.5 font-medium text-ash w-40 text-xs uppercase tracking-wide">Debit</th>
                  <th className="text-right px-3 py-2.5 font-medium text-ash w-40 text-xs uppercase tracking-wide">Credit</th>
                </tr>
              </thead>
              <tbody>
                {report.rows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-10 text-center text-ash text-sm">
                      No accounts found.
                    </td>
                  </tr>
                ) : (
                  grouped.map(({ type, rows }) => (
                    <Fragment key={type}>
                      {/* Type group header */}
                      <tr className="bg-raised/50 border-b border-rim">
                        <td colSpan={4} className="px-3 py-1.5 text-[10px] font-bold text-ash uppercase tracking-widest">
                          {type}
                        </td>
                      </tr>

                      {rows.map((row) => {
                        const debitDisplay = row.debit > row.credit ? row.debit - row.credit : null
                        const creditDisplay = row.credit > row.debit ? row.credit - row.debit : null
                        return (
                          <tr
                            key={row.account.id}
                            className="border-b border-rim/60 hover:bg-raised/40 transition-colors"
                          >
                            <td className="px-3 py-2.5 font-mono text-ash text-xs">{row.account.number}</td>
                            <td className="px-3 py-2.5 text-chalk text-sm">{row.account.name}</td>
                            <td className="px-3 py-2.5 text-right font-mono text-chalk">
                              {debitDisplay !== null ? fmt(debitDisplay) : <span className="text-ash/40">—</span>}
                            </td>
                            <td className="px-3 py-2.5 text-right font-mono text-chalk">
                              {creditDisplay !== null ? fmt(creditDisplay) : <span className="text-ash/40">—</span>}
                            </td>
                          </tr>
                        )
                      })}
                    </Fragment>
                  ))
                )}

                {/* Totals row */}
                <tr className="border-t-2 border-rim bg-raised">
                  <td colSpan={2} className="px-3 py-3 text-xs font-bold text-ash uppercase tracking-widest">
                    Total
                  </td>
                  <td className="px-3 py-3 text-right font-mono font-bold text-neon">
                    {fmt(report.totalDebits)}
                  </td>
                  <td className="px-3 py-3 text-right font-mono font-bold text-neon">
                    {fmt(report.totalCredits)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex items-center gap-2 text-xs text-ash">
            {report.balanced ? (
              <span className="text-emerald-400 font-bold tracking-wide">✓ Balanced</span>
            ) : (
              <span className="text-red-400 font-bold tracking-wide">✗ Out of balance</span>
            )}
          </div>
        </>
      )}
    </div>
  )
}
