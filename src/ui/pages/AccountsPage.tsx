import { useState, useEffect } from 'react'
import { api, Account, AccountType } from '../api/client'
import NewAccountModal from '../components/NewAccountModal'

function typeBadge(type: AccountType): string {
  switch (type) {
    case 'Asset':     return 'bg-sky-900/50 text-sky-300'
    case 'Liability': return 'bg-orange-900/50 text-orange-300'
    case 'Equity':    return 'bg-violet-900/50 text-violet-300'
    case 'Revenue':   return 'bg-emerald-900/50 text-emerald-300'
    case 'Expense':   return 'bg-red-900/50 text-red-300'
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
        <h1 className="text-xl font-semibold text-chalk">Chart of Accounts</h1>
        <button
          onClick={() => setShowNew(true)}
          className="border border-rim hover:bg-raised text-chalk text-sm font-medium px-4 py-2 rounded-md transition-colors"
        >
          + New Account
        </button>
      </div>

      {loading && <p className="text-sm text-ash">Loading…</p>}

      {error && (
        <div className="text-sm text-red-300 bg-red-950/50 border border-red-800 px-4 py-3 rounded-md">
          {error}
        </div>
      )}

      {!loading && !error && (
        <div className="bg-surface rounded-lg border border-rim overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-raised border-b border-rim">
                <th className="text-left px-4 py-3 font-medium text-ash">Number</th>
                <th className="text-left px-4 py-3 font-medium text-ash">Name</th>
                <th className="text-left px-4 py-3 font-medium text-ash">Type</th>
                <th className="text-left px-4 py-3 font-medium text-ash">Normal Balance</th>
                <th className="text-left px-4 py-3 font-medium text-ash">Contra</th>
              </tr>
            </thead>
            <tbody>
              {accounts.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-ash text-sm">
                    No accounts yet. Click <strong className="text-chalk">+ New Account</strong> to
                    build your chart of accounts.
                  </td>
                </tr>
              ) : (
                accounts.map((account) => (
                  <tr
                    key={account.id}
                    className="border-b border-rim last:border-0 hover:bg-raised transition-colors"
                  >
                    <td className="px-4 py-3 font-mono text-ash">{account.number}</td>
                    <td className="px-4 py-3 text-chalk font-medium">{account.name}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${typeBadge(account.type)}`}
                      >
                        {account.type}
                      </span>
                    </td>
                    <td className="px-4 py-3 capitalize text-ash">{account.normalBalance}</td>
                    <td className="px-4 py-3 text-xs">
                      {account.isContra ? (
                        <span className="text-violet font-medium">Contra</span>
                      ) : (
                        <span className="text-ash">—</span>
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
