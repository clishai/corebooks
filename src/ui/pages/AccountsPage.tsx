import { useState, useEffect } from 'react'
import { api, Account, AccountType } from '../api/client'
import NewAccountModal from '../components/NewAccountModal'

function typeBadge(type: AccountType): string {
  switch (type) {
    case 'Asset':     return 'bg-blue-50 text-blue-700'
    case 'Liability': return 'bg-orange-50 text-orange-700'
    case 'Equity':    return 'bg-purple-50 text-purple-700'
    case 'Revenue':   return 'bg-green-50 text-green-700'
    case 'Expense':   return 'bg-red-50 text-red-700'
  }
}

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)

  useEffect(() => {
    api.accounts
      .list()
      .then(setAccounts)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load accounts.'))
      .finally(() => setLoading(false))
  }, [])

  function handleCreated(account: Account) {
    setAccounts((prev) =>
      [...prev, account].sort((a, b) => a.number.localeCompare(b.number)),
    )
    setShowNew(false)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-semibold text-slate-900">Chart of Accounts</h1>
        <button
          onClick={() => setShowNew(true)}
          className="border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-medium px-4 py-2 rounded-md transition-colors"
        >
          + New Account
        </button>
      </div>

      {loading && <p className="text-sm text-slate-500">Loading…</p>}

      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 px-4 py-3 rounded-md">
          {error}
        </div>
      )}

      {!loading && !error && (
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 font-medium text-slate-600">Number</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Name</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Type</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Normal Balance</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Contra</th>
              </tr>
            </thead>
            <tbody>
              {accounts.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-10 text-center text-slate-400 text-sm"
                  >
                    No accounts yet. Click <strong>+ New Account</strong> to build your chart of
                    accounts.
                  </td>
                </tr>
              ) : (
                accounts.map((account) => (
                  <tr
                    key={account.id}
                    className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors"
                  >
                    <td className="px-4 py-3 font-mono text-slate-600">{account.number}</td>
                    <td className="px-4 py-3 text-slate-900 font-medium">{account.name}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${typeBadge(account.type)}`}
                      >
                        {account.type}
                      </span>
                    </td>
                    <td className="px-4 py-3 capitalize text-slate-600">
                      {account.normalBalance}
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs">
                      {account.isContra ? (
                        <span className="text-amber-600 font-medium">Contra</span>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {showNew && (
        <NewAccountModal onClose={() => setShowNew(false)} onCreated={handleCreated} />
      )}
    </div>
  )
}
