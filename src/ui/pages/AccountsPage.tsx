import { useState, useEffect, useCallback } from 'react'
import { api, Account, AccountType, TrialBalanceRow } from '../api/client'
import NewAccountModal from '../components/NewAccountModal'
import EditAccountModal from '../components/EditAccountModal'
import AccountLibraryDrawer from '../components/AccountLibraryDrawer'
import { AccountColumnId, getVisibleColumns } from '../lib/accountColumns'
import BulkActionBar from '../components/BulkActionBar'

function typeBadge(type: AccountType): string {
  switch (type) {
    case 'Asset':     return 'bg-sky-900/50 text-sky-300'
    case 'Liability': return 'bg-orange-900/50 text-orange-300'
    case 'Equity':    return 'bg-violet-900/50 text-violet-300'
    case 'Revenue':   return 'bg-emerald-900/50 text-emerald-300'
    case 'Expense':   return 'bg-red-900/50 text-red-300'
  }
}

function formatBalance(amount: number): string {
  const abs = Math.abs(amount)
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(abs)
}

function buildBalanceMap(rows: TrialBalanceRow[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const row of rows) {
    const balance =
      row.account.normalBalance === 'debit'
        ? row.debit - row.credit
        : row.credit - row.debit
    map.set(row.account.id, balance)
  }
  return map
}

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [balanceMap, setBalanceMap] = useState<Map<string, number>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [showLibrary, setShowLibrary] = useState(false)
  const [editAccount, setEditAccount] = useState<Account | null>(null)
  const [visibleCols, setVisibleCols] = useState<AccountColumnId[]>(getVisibleColumns)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function clearSelection() {
    setSelected(new Set())
  }

  const loadAccounts = useCallback(() => {
    Promise.all([api.accounts.list(), api.reports.trialBalance()])
      .then(([accts, tb]) => {
        setAccounts(accts)
        setBalanceMap(buildBalanceMap(tb.rows))
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load accounts.'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    loadAccounts()
  }, [loadAccounts])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') clearSelection()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Re-read column prefs whenever the user navigates back to this page (storage
  // may have changed in Settings without a full remount).
  useEffect(() => {
    function onFocus() { setVisibleCols(getVisibleColumns()) }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])

  function handleCreated(account: Account) {
    setAccounts((prev) =>
      [...prev, account].sort((a, b) => a.number.localeCompare(b.number)),
    )
    setShowNew(false)
  }

  function handleSaved() {
    setEditAccount(null)
    loadAccounts()
  }

  const show = (col: AccountColumnId) => visibleCols.includes(col)

  // Number + Name (fixed) + one column per visible optional col + edit button (fixed)
  // checkbox col (1) + Number + Name (2 fixed) + optional cols + edit button (1)
  const colCount = 4 + visibleCols.length

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-semibold text-chalk">Chart of Accounts</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setShowLibrary(true)}
            className="border border-rim hover:bg-raised text-ash hover:text-chalk text-sm font-medium px-4 py-2 rounded-md transition-colors"
          >
            Browse Library
          </button>
          <button
            onClick={() => setShowNew(true)}
            className="border border-rim hover:bg-raised text-chalk text-sm font-medium px-4 py-2 rounded-md transition-colors"
          >
            + New Account
          </button>
        </div>
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
                <th className="w-8" />
                <th className="text-left px-4 py-3 font-medium text-ash">Number</th>
                <th className="text-left px-4 py-3 font-medium text-ash">Name</th>
                {show('type')           && <th className="text-left px-4 py-3 font-medium text-ash">Type</th>}
                {show('normalBalance')  && <th className="text-left px-4 py-3 font-medium text-ash">Normal Balance</th>}
                {show('contra')         && <th className="text-left px-4 py-3 font-medium text-ash">Contra?</th>}
                {show('classification') && <th className="text-left px-4 py-3 font-medium text-ash">Classification</th>}
                {show('balance')        && <th className="text-right px-4 py-3 font-medium text-ash">Current Balance</th>}
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {accounts.length === 0 ? (
                <tr>
                  <td colSpan={colCount} className="px-4 py-10 text-center text-ash text-sm">
                    No accounts yet. Click <strong className="text-chalk">+ New Account</strong> to
                    build your chart of accounts.
                  </td>
                </tr>
              ) : (
                accounts.map((account) => {
                  const balance = balanceMap.get(account.id) ?? 0
                  const isAbnormal = balance < 0
                  return (
                    <tr
                      key={account.id}
                      className="group border-b border-rim last:border-0 hover:bg-raised transition-colors"
                    >
                      <td className="py-2 px-2 w-8">
                        <input
                          type="checkbox"
                          checked={selected.has(account.id)}
                          onChange={() => toggleSelect(account.id)}
                          className="opacity-0 group-hover:opacity-100 checked:opacity-100 accent-neon transition-opacity"
                          onClick={(e) => e.stopPropagation()}
                        />
                      </td>
                      <td className="px-4 py-3 font-mono text-ash">{account.number}</td>
                      <td className="px-4 py-3 text-chalk font-medium">{account.name}</td>
                      {show('type') && (
                        <td className="px-4 py-3">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${typeBadge(account.type)}`}
                          >
                            {account.type}
                          </span>
                        </td>
                      )}
                      {show('normalBalance') && (
                        <td className="px-4 py-3 capitalize text-ash">{account.normalBalance}</td>
                      )}
                      {show('contra') && (
                        <td className="px-4 py-3 text-xs">
                          {account.isContra ? (
                            <span className="text-emerald-400 text-base leading-none">✓</span>
                          ) : (
                            <span className="text-ash">—</span>
                          )}
                        </td>
                      )}
                      {show('classification') && (
                        <td className="px-4 py-3 text-xs text-ash capitalize">
                          {account.classification ?? '—'}
                        </td>
                      )}
                      {show('balance') && (
                        <td className={`px-4 py-3 text-right tabular-nums text-sm ${isAbnormal ? 'text-amber-400' : 'text-chalk'}`}>
                          {balance === 0
                            ? <span className="text-ash">$0.00</span>
                            : <>{isAbnormal ? <span className="text-xs text-ash mr-1">!</span> : null}{formatBalance(balance)}</>
                          }
                        </td>
                      )}
                      <td className="px-2 py-3 text-right">
                        <button
                          onClick={() => setEditAccount(account)}
                          className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 text-xs text-ash hover:text-neon px-2 py-1 rounded border border-transparent hover:border-rim"
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      <BulkActionBar
        count={selected.size}
        onClear={clearSelection}
        actions={[
          {
            label: 'Set classification',
            onClick: async () => {
              const val = prompt('Set classification: "current" or "non-current"')
              if (val !== 'current' && val !== 'non-current') return
              const ids = Array.from(selected)
              for (const id of ids) {
                await api.accounts.update(id, { classification: val })
              }
              clearSelection()
              loadAccounts()
            },
          },
        ]}
      />

      {showLibrary && (
        <AccountLibraryDrawer
          existingNumbers={new Set(accounts.map((a) => a.number))}
          onClose={() => setShowLibrary(false)}
          onAdded={loadAccounts}
        />
      )}

      {showNew && (
        <NewAccountModal onClose={() => setShowNew(false)} onCreated={handleCreated} />
      )}

      {editAccount && (
        <EditAccountModal
          account={editAccount}
          onClose={() => setEditAccount(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  )
}
