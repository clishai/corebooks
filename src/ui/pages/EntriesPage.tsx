import { useState, useEffect, Fragment } from 'react'
import { api, JournalEntry, Account } from '../api/client'

function fmt(amount: number): string {
  return amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export default function EntriesPage() {
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [accountMap, setAccountMap] = useState<Map<string, Account>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  useEffect(() => {
    Promise.all([api.entries.list(), api.accounts.list()])
      .then(([entries, accounts]) => {
        setEntries(entries)
        setAccountMap(new Map(accounts.map((a) => [a.id, a])))
      })
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : 'Failed to load entries.'),
      )
      .finally(() => setLoading(false))
  }, [])

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-semibold text-chalk">Journal Entries</h1>
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
                <th className="text-left px-4 py-3 font-medium text-ash w-32">Date</th>
                <th className="text-left px-4 py-3 font-medium text-ash">Memo</th>
                <th className="text-right px-4 py-3 font-medium text-ash w-36">Debits</th>
                <th className="text-right px-4 py-3 font-medium text-ash w-36">Credits</th>
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-ash text-sm">
                    No posted entries yet. Use the{' '}
                    <strong className="text-chalk">+ New Entry</strong> button to create one.
                  </td>
                </tr>
              ) : (
                entries.map((entry) => {
                  const id = entry.id ?? ''
                  const isOpen = expanded.has(id)
                  const totalDebits = entry.lines
                    .filter((l) => l.type === 'debit')
                    .reduce((s, l) => s + l.amount, 0)
                  const totalCredits = entry.lines
                    .filter((l) => l.type === 'credit')
                    .reduce((s, l) => s + l.amount, 0)

                  return (
                    <Fragment key={id}>
                      <tr
                        className="border-b border-rim hover:bg-raised cursor-pointer transition-colors"
                        onClick={() => toggleExpand(id)}
                      >
                        <td className="pl-3 py-3 text-ash text-xs select-none">
                          {isOpen ? '▾' : '▸'}
                        </td>
                        <td className="px-4 py-3 text-ash whitespace-nowrap">
                          {formatDate(entry.date)}
                        </td>
                        <td className="px-4 py-3 text-chalk">
                          {entry.memo}
                          {entry.paymentMethod ? (
                            <span className="ml-2 text-xs text-ash font-normal">
                              {entry.paymentMethod}
                            </span>
                          ) : (
                            <span className="ml-2 text-xs text-ash/50 italic font-normal">
                              adjustment
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-chalk">
                          {fmt(totalDebits)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-chalk">
                          {fmt(totalCredits)}
                        </td>
                      </tr>

                      {isOpen &&
                        entry.lines.map((line, i) => (
                          <tr key={i} className="bg-raised border-b border-rim">
                            <td />
                            <td className="px-4 py-1.5" />
                            <td className="px-4 py-1.5 pl-10 text-ash text-xs">
                              {accountMap.get(line.accountId)?.name ?? line.accountId}
                            </td>
                            <td className="px-4 py-1.5 text-right font-mono text-xs text-ash">
                              {line.type === 'debit' ? fmt(line.amount) : ''}
                            </td>
                            <td className="px-4 py-1.5 text-right font-mono text-xs text-ash">
                              {line.type === 'credit' ? fmt(line.amount) : ''}
                            </td>
                          </tr>
                        ))}
                    </Fragment>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
