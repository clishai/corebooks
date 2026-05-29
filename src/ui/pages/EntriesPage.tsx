import { useState, useEffect, useCallback, Fragment, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api, JournalEntry, Account } from '../api/client'
import BulkActionBar from '../components/BulkActionBar'

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

type DatePreset =
  | 'today' | 'yesterday' | 'this-week' | 'this-month'
  | 'last-month' | 'last-30' | 'last-90' | 'this-year'
  | 'all-time' | 'custom'

const PRESET_LABELS: Record<DatePreset, string> = {
  'today':      'Today',
  'yesterday':  'Yesterday',
  'this-week':  'Week to Date',
  'this-month': 'Month to Date',
  'last-month': 'Last Month',
  'last-30':    'Last 30 Days',
  'last-90':    'Last 90 Days',
  'this-year':  'Year to Date',
  'all-time':   'All Time',
  'custom':     'Custom Range',
}

function parseDatePreset(value: string | null): DatePreset | null {
  return value && value in PRESET_LABELS ? value as DatePreset : null
}

function getPresetRange(preset: DatePreset): { from?: string; to?: string } {
  const now = new Date()
  const y = now.getFullYear(), m = now.getMonth(), d = now.getDate()
  const iso = (dt: Date) => dt.toISOString().slice(0, 10)
  const todayStr = iso(now)

  switch (preset) {
    case 'today':      return { from: todayStr, to: todayStr }
    case 'yesterday': {
      const s = iso(new Date(y, m, d - 1))
      return { from: s, to: s }
    }
    case 'this-week': {
      const dow = now.getDay()
      const monOffset = dow === 0 ? -6 : 1 - dow
      return { from: iso(new Date(y, m, d + monOffset)), to: todayStr }
    }
    case 'this-month': return { from: iso(new Date(y, m, 1)), to: todayStr }
    case 'last-month': return { from: iso(new Date(y, m - 1, 1)), to: iso(new Date(y, m, 0)) }
    case 'last-30':    return { from: iso(new Date(y, m, d - 30)), to: todayStr }
    case 'last-90':    return { from: iso(new Date(y, m, d - 90)), to: todayStr }
    case 'this-year':  return { from: `${y}-01-01`, to: todayStr }
    case 'all-time':
    case 'custom':     return {}
  }
}

function computePages(entries: JournalEntry[]): JournalEntry[][] {
  if (entries.length === 0) return [[]]
  const pages: JournalEntry[][] = []
  let cur: JournalEntry[] = []
  let lineCount = 0

  for (const entry of entries) {
    const n = entry.lines.length
    if (cur.length >= 50 || (lineCount + n > 150 && cur.length > 0)) {
      pages.push(cur)
      cur = [entry]
      lineCount = n
    } else {
      cur.push(entry)
      lineCount += n
    }
  }
  if (cur.length > 0) pages.push(cur)
  return pages
}

export default function EntriesPage() {
  const [searchParams] = useSearchParams()
  const initialPreset = parseDatePreset(searchParams.get('preset')) ?? 'this-month'
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [accountMap, setAccountMap] = useState<Map<string, Account>>(new Map())
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const [preset, setPreset] = useState<DatePreset>(initialPreset)
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  const [showFilters, setShowFilters] = useState(false)
  const [memoFilter, setMemoFilter] = useState('')
  const [accountFilter, setAccountFilter] = useState('')
  const filtersRef = useRef<HTMLDivElement>(null)

  const [page, setPage] = useState(0)

  useEffect(() => {
    const urlPreset = parseDatePreset(searchParams.get('preset'))
    if (urlPreset && urlPreset !== preset) {
      setPreset(urlPreset)
      setPage(0)
    }
  }, [searchParams, preset])

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function clearSelection() { setSelected(new Set()) }

  const getRange = useCallback((): { from?: string; to?: string } => {
    if (preset === 'custom') return { from: customFrom || undefined, to: customTo || undefined }
    return getPresetRange(preset)
  }, [preset, customFrom, customTo])

  const loadEntries = useCallback(() => {
    const { from, to } = getRange()
    setLoading(true)
    Promise.all([api.entries.list({ from, to }), api.accounts.list()])
      .then(([data, accts]) => {
        setEntries(data)
        setAccounts(accts)
        setAccountMap(new Map(accts.map((a) => [a.id, a])))
        setPage(0)
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load entries.'))
      .finally(() => setLoading(false))
  }, [getRange])

  useEffect(() => { loadEntries() }, [loadEntries])

  useEffect(() => {
    window.addEventListener('cb:entry-posted', loadEntries)
    return () => window.removeEventListener('cb:entry-posted', loadEntries)
  }, [loadEntries])

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') clearSelection() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (filtersRef.current && !filtersRef.current.contains(e.target as Node)) {
        setShowFilters(false)
      }
    }
    if (showFilters) document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [showFilters])

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const filteredEntries = entries.filter((e) => {
    if (memoFilter && !e.memo.toLowerCase().includes(memoFilter.toLowerCase())) return false
    if (accountFilter && !e.lines.some((l) => l.accountId === accountFilter)) return false
    return true
  })

  const pages = computePages(filteredEntries)
  const currentPageEntries = pages[page] ?? []
  const hasExtraFilters = !!memoFilter || !!accountFilter

  useEffect(() => {
    const entryId = searchParams.get('entry')
    if (!entryId || loading) return

    const matchingIndex = filteredEntries.findIndex((entry) => entry.id === entryId)
    if (matchingIndex === -1) return

    const pageIndex = pages.findIndex((entriesOnPage) =>
      entriesOnPage.some((entry) => entry.id === entryId),
    )
    if (pageIndex >= 0) {
      setPage((current) => current === pageIndex ? current : pageIndex)
    }
    setExpanded((current) => {
      if (current.has(entryId)) return current
      const next = new Set(current)
      next.add(entryId)
      return next
    })
  }, [searchParams, loading, filteredEntries, pages])

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-semibold text-chalk">Journal Entries</h1>
        <span className="text-sm text-ash">{filteredEntries.length} entries</span>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <select
          value={preset}
          onChange={(e) => { setPreset(e.target.value as DatePreset); setPage(0) }}
          className="bg-surface border border-rim rounded-md px-3 py-1.5 text-sm text-chalk focus:outline-none focus:border-neon cursor-pointer"
        >
          {(Object.keys(PRESET_LABELS) as DatePreset[]).map((k) => (
            <option key={k} value={k}>{PRESET_LABELS[k]}</option>
          ))}
        </select>

        {preset === 'custom' && (
          <>
            <input
              type="date"
              value={customFrom}
              onChange={(e) => { setCustomFrom(e.target.value); setPage(0) }}
              className="bg-surface border border-rim rounded-md px-3 py-1.5 text-sm text-chalk focus:outline-none focus:border-neon"
            />
            <span className="text-ash text-sm">→</span>
            <input
              type="date"
              value={customTo}
              onChange={(e) => { setCustomTo(e.target.value); setPage(0) }}
              className="bg-surface border border-rim rounded-md px-3 py-1.5 text-sm text-chalk focus:outline-none focus:border-neon"
            />
          </>
        )}

        {/* More filters */}
        <div className="relative ml-auto" ref={filtersRef}>
          <button
            onClick={() => setShowFilters((v) => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-md transition-colors cursor-pointer ${
              hasExtraFilters
                ? 'bg-neon/10 border-neon/50 text-neon'
                : 'bg-surface border-rim text-ash hover:text-chalk'
            }`}
          >
            {hasExtraFilters && <span className="w-1.5 h-1.5 rounded-full bg-neon" />}
            Filters
            <span className="text-xs opacity-60">▾</span>
          </button>

          {showFilters && (
            <div className="absolute right-0 top-full mt-2 w-64 bg-raised border border-rim rounded-lg p-4 z-20 shadow-xl space-y-3">
              <div>
                <label className="block text-xs text-ash mb-1.5">Memo contains</label>
                <input
                  type="text"
                  value={memoFilter}
                  onChange={(e) => { setMemoFilter(e.target.value); setPage(0) }}
                  placeholder="Search memo…"
                  className="w-full bg-base border border-rim rounded-md px-3 py-1.5 text-sm text-chalk placeholder:text-ash focus:outline-none focus:border-neon"
                />
              </div>
              <div>
                <label className="block text-xs text-ash mb-1.5">Account</label>
                <select
                  value={accountFilter}
                  onChange={(e) => { setAccountFilter(e.target.value); setPage(0) }}
                  className="w-full bg-base border border-rim rounded-md px-3 py-1.5 text-sm text-chalk focus:outline-none focus:border-neon cursor-pointer"
                >
                  <option value="">All accounts</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.number} {a.name}</option>
                  ))}
                </select>
              </div>
              {hasExtraFilters && (
                <button
                  onClick={() => { setMemoFilter(''); setAccountFilter(''); setPage(0) }}
                  className="text-xs text-ash hover:text-chalk transition-colors cursor-pointer"
                >
                  Clear filters
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {loading && <p className="text-sm text-ash">Loading…</p>}

      {error && (
        <div className="text-sm text-red-300 bg-red-950/50 border border-red-800 px-4 py-3 rounded-md">
          {error}
        </div>
      )}

      {!loading && !error && (
        <>
          <div className="bg-surface rounded-lg border border-rim overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-raised border-b border-rim">
                  <th className="w-8" />
                  <th className="w-8" />
                  <th className="text-left px-4 py-3 font-medium text-ash w-32">Date</th>
                  <th className="text-left px-4 py-3 font-medium text-ash">Memo</th>
                  <th className="text-right px-4 py-3 font-medium text-ash w-36">Debits</th>
                  <th className="text-right px-4 py-3 font-medium text-ash w-36">Credits</th>
                </tr>
              </thead>
              <tbody>
                {currentPageEntries.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-ash text-sm">
                      {entries.length === 0
                        ? <>No posted entries yet. Use the <strong className="text-chalk">+ New Entry</strong> button to create one.</>
                        : 'No entries match the current filters.'}
                    </td>
                  </tr>
                ) : (
                  currentPageEntries.map((entry) => {
                    const id = entry.id ?? ''
                    const isOpen = expanded.has(id)
                    const totalDebits = entry.lines.filter((l) => l.type === 'debit').reduce((s, l) => s + l.amount, 0)
                    const totalCredits = entry.lines.filter((l) => l.type === 'credit').reduce((s, l) => s + l.amount, 0)

                    return (
                      <Fragment key={id}>
                        <tr
                          className="group border-b border-rim hover:bg-raised cursor-pointer transition-colors"
                          onClick={() => toggleExpand(id)}
                        >
                          <td className="py-2 px-2 w-8" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={selected.has(id)}
                              onChange={() => toggleSelect(id)}
                              className="opacity-0 group-hover:opacity-100 checked:opacity-100 accent-neon transition-opacity"
                              onClick={(e) => e.stopPropagation()}
                            />
                          </td>
                          <td className="pl-3 py-3 text-ash text-xs select-none">
                            {isOpen ? '▾' : '▸'}
                          </td>
                          <td className="px-4 py-3 text-ash whitespace-nowrap">
                            {formatDate(entry.date)}
                          </td>
                          <td className="px-4 py-3 text-chalk">
                            {entry.memo}
                            {entry.paymentMethod ? (
                              <span className="ml-2 text-xs text-ash font-normal">{entry.paymentMethod}</span>
                            ) : (
                              <span className="ml-2 text-xs text-ash/50 italic font-normal">adjustment</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-chalk">{fmt(totalDebits)}</td>
                          <td className="px-4 py-3 text-right font-mono text-chalk">{fmt(totalCredits)}</td>
                        </tr>

                        {isOpen && entry.lines.map((line, i) => (
                          <tr key={i} className="bg-raised border-b border-rim">
                            <td /><td />
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

          {pages.length > 1 && (
            <div className="flex items-center justify-center gap-4 mt-4">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="text-sm text-ash hover:text-chalk disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                ← Prev
              </button>
              <span className="text-sm text-ash">Page {page + 1} of {pages.length}</span>
              <button
                onClick={() => setPage((p) => Math.min(pages.length - 1, p + 1))}
                disabled={page === pages.length - 1}
                className="text-sm text-ash hover:text-chalk disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}

      <BulkActionBar
        count={selected.size}
        onClear={clearSelection}
        actions={[
          {
            label: 'Export selected',
            onClick: () => {
              const sel = entries.filter((e) => selected.has(e.id ?? ''))
              const blob = new Blob([JSON.stringify(sel, null, 2)], { type: 'application/json' })
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url
              a.download = `entries-export-${new Date().toISOString().slice(0, 10)}.json`
              a.click()
              URL.revokeObjectURL(url)
            },
          },
          {
            label: 'Reverse selected',
            destructive: true,
            onClick: async () => {
              if (!confirm(`Reverse ${selected.size} entr${selected.size === 1 ? 'y' : 'ies'}?`)) return
              for (const id of Array.from(selected)) {
                await api.entries.reverse(id)
              }
              clearSelection()
              loadEntries()
            },
          },
        ]}
      />
    </div>
  )
}
