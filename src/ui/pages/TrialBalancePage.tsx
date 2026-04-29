import { useState, useEffect } from 'react'
import { api, TrialBalance } from '../api/client'

function fmt(amount: number): string {
  return amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

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

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-chalk">Trial Balance</h1>
        <p className="text-sm text-ash mt-1">Current balances across all accounts.</p>
      </div>

      {loading && <p className="text-sm text-ash">Loading…</p>}

      {error && (
        <div className="text-sm text-red-300 bg-red-950/50 border border-red-800 px-4 py-3 rounded-md">
          {error}
        </div>
      )}

      {report && (
        <>
          {!report.balanced && (
            <div className="text-sm text-amber-300 bg-amber-950/50 border border-amber-800 px-4 py-3 rounded-md mb-4">
              Ledger is out of balance. Total debits and credits do not match.
            </div>
          )}

          <div className="bg-surface rounded-lg border border-rim overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-raised border-b border-rim">
                  <th className="text-left px-4 py-3 font-medium text-ash w-24">Number</th>
                  <th className="text-left px-4 py-3 font-medium text-ash">Account</th>
                  <th className="text-right px-4 py-3 font-medium text-ash w-40">Debit</th>
                  <th className="text-right px-4 py-3 font-medium text-ash w-40">Credit</th>
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
                  report.rows.map((row) => (
                    <tr
                      key={row.account.id}
                      className="border-b border-rim last:border-0 hover:bg-raised transition-colors"
                    >
                      <td className="px-4 py-3 font-mono text-ash text-xs">{row.account.number}</td>
                      <td className="px-4 py-3 text-chalk">{row.account.name}</td>
                      <td className="px-4 py-3 text-right font-mono text-chalk">
                        {row.debit > 0 ? fmt(row.debit) : <span className="text-ash">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-chalk">
                        {row.credit > 0 ? fmt(row.credit) : <span className="text-ash">—</span>}
                      </td>
                    </tr>
                  ))
                )}

                {/* Totals row */}
                <tr className="border-t-2 border-rim bg-raised">
                  <td colSpan={2} className="px-4 py-3 text-xs font-semibold text-ash uppercase tracking-wide">
                    Total
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-semibold text-neon">
                    {fmt(report.totalDebits)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-semibold text-neon">
                    {fmt(report.totalCredits)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex items-center gap-2 text-xs text-ash">
            {report.balanced ? (
              <span className="text-emerald-400 font-medium">✓ Balanced</span>
            ) : (
              <span className="text-red-400 font-medium">✗ Out of balance</span>
            )}
          </div>
        </>
      )}
    </div>
  )
}
