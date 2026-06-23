import { useEffect, useState } from 'react'
import { api } from '../api/client'

function fmt(amount: number): string {
  return amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

export default function CashFlowPage() {
  const [data, setData] = useState<{ netCash: number; cashAccountIds: string[]; entryCount: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    api.reports.cashFlow()
      .then(setData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load cash flow.'))
      .finally(() => setLoading(false))
  }, [])
  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-semibold text-chalk mb-5">Cash Flow Snapshot</h1>
      <div className="bg-surface border border-rim rounded-sm px-6 py-6">
        <p className="text-xs text-ash uppercase tracking-widest">Net cash movement</p>
        <p className={`text-3xl font-semibold mt-2 ${data && data.netCash >= 0 ? 'text-neon' : 'text-red-300'}`}>
          {loading ? 'Loading…' : data ? fmt(data.netCash) : 'Unavailable'}
        </p>
        {error && <p className="text-sm text-red-300 mt-3">{error}</p>}
        <p className="text-sm text-ash mt-3">
          Based on {data?.entryCount ?? 0} posted entries and {data?.cashAccountIds.length ?? 0} cash/bank-like accounts.
        </p>
      </div>
    </div>
  )
}
