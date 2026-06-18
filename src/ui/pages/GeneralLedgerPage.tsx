import { useEffect, useState } from 'react'
import { api } from '../api/client'

function fmt(amount: number): string {
  return amount ? amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' }) : ''
}

export default function GeneralLedgerPage() {
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([])
  useEffect(() => { api.reports.generalLedger().then(setRows).catch(() => setRows([])) }, [])
  return (
    <div>
      <h1 className="text-xl font-semibold text-chalk mb-5">General Ledger</h1>
      <div className="bg-surface border border-rim rounded-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-raised text-ash"><tr><th className="text-left px-4 py-3">Date</th><th className="text-left px-4 py-3">Account</th><th className="text-left px-4 py-3">Memo</th><th className="text-right px-4 py-3">Debit</th><th className="text-right px-4 py-3">Credit</th></tr></thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-t border-rim">
                <td className="px-4 py-2 text-ash">{String(row.date).slice(0, 10)}</td>
                <td className="px-4 py-2 text-chalk">{row.accountNumber as string} {row.accountName as string}</td>
                <td className="px-4 py-2 text-ash">{row.memo as string}</td>
                <td className="px-4 py-2 text-right font-mono">{fmt(Number(row.debit))}</td>
                <td className="px-4 py-2 text-right font-mono">{fmt(Number(row.credit))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
