import { useEffect, useState } from 'react'
import { api, type Account } from '../api/client'

function fmt(amount: number): string {
  return amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

export default function AccountActivityPage() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [accountId, setAccountId] = useState('')
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([])

  useEffect(() => {
    api.accounts.list().then((data) => {
      setAccounts(data)
      setAccountId(data[0]?.id ?? '')
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (!accountId) return
    api.reports.accountActivity(accountId).then(setRows).catch(() => setRows([]))
  }, [accountId])

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-semibold text-chalk">Account Activity</h1>
        <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className="bg-surface border border-rim rounded-sm px-3 py-2 text-sm text-chalk">
          {accounts.map((account) => <option key={account.id} value={account.id}>{account.number} {account.name}</option>)}
        </select>
      </div>
      <div className="bg-surface border border-rim rounded-sm overflow-hidden">
        {rows.map((row, i) => (
          <div key={i} className="grid grid-cols-[100px_1fr_120px_120px] gap-3 px-4 py-2 border-b border-rim text-sm">
            <span className="text-ash">{String(row.date).slice(0, 10)}</span>
            <span className="text-chalk">{row.memo as string}</span>
            <span className="text-right font-mono text-ash">{fmt(Number(row.debit) - Number(row.credit))}</span>
            <span className="text-right font-mono text-neon">{fmt(Number(row.running))}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
