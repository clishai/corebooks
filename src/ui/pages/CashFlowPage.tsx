import { useEffect, useState } from 'react'
import { api } from '../api/client'

function fmt(amount: number): string {
  return amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

export default function CashFlowPage() {
  const [data, setData] = useState<{ netCash: number; cashAccountIds: string[]; entryCount: number } | null>(null)
  useEffect(() => { api.reports.cashFlow().then(setData).catch(() => setData(null)) }, [])
  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-semibold text-chalk mb-5">Cash Flow Snapshot</h1>
      <div className="bg-surface border border-rim rounded-sm px-6 py-6">
        <p className="text-xs text-ash uppercase tracking-widest">Net cash movement</p>
        <p className={`text-3xl font-semibold mt-2 ${data && data.netCash >= 0 ? 'text-neon' : 'text-red-300'}`}>
          {data ? fmt(data.netCash) : 'Loading…'}
        </p>
        <p className="text-sm text-ash mt-3">
          Based on {data?.entryCount ?? 0} posted entries and {data?.cashAccountIds.length ?? 0} cash/bank-like accounts.
        </p>
      </div>
    </div>
  )
}
