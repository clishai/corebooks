import { useState, useEffect } from 'react'
import {
  getPeriodConfig,
  getClosedPeriods,
  generateClosingEntry,
  postClosingEntry,
  type PeriodConfig,
  type ClosedPeriod,
  type ClosingEntryResult,
} from '../api/client'

// Generates the last 12 calendar months in reverse chronological order,
// starting from the current month.
function getLast12Months(): Array<{ year: number; month: number }> {
  const months: Array<{ year: number; month: number }> = []
  const now = new Date()
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push({ year: d.getFullYear(), month: d.getMonth() + 1 })
  }
  return months
}

function formatMonth(year: number, month: number): string {
  return new Date(year, month - 1, 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  })
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
}

type PeriodStatus = 'closed' | 'current' | 'open'

function StatusBadge({ status }: { status: PeriodStatus }) {
  if (status === 'closed') {
    return (
      <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-emerald-950/60 text-emerald-300 border border-emerald-800/50">
        Closed
      </span>
    )
  }
  if (status === 'current') {
    return (
      <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-amber-950/60 text-amber-300 border border-amber-700/50">
        Current
      </span>
    )
  }
  return (
    <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-surface text-ash border border-rim">
      Open
    </span>
  )
}

export default function ClosePeriodPage() {
  const [config, setConfig] = useState<PeriodConfig | null>(null)
  const [closedPeriods, setClosedPeriods] = useState<ClosedPeriod[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Per-period action state
  const [activePeriod, setActivePeriod] = useState<{ year: number; month: number } | null>(null)
  const [generating, setGenerating] = useState(false)
  const [pendingDraft, setPendingDraft] = useState<ClosingEntryResult | null>(null)
  const [posting, setPosting] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const months = getLast12Months()
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1

  function isCurrentPeriod(year: number, month: number): boolean {
    return year === currentYear && month === currentMonth
  }

  function isClosed(year: number, month: number): boolean {
    return closedPeriods.some((p) => p.year === year && p.month === month)
  }

  function getStatus(year: number, month: number): PeriodStatus {
    if (isClosed(year, month)) return 'closed'
    if (isCurrentPeriod(year, month)) return 'current'
    return 'open'
  }

  function load() {
    setLoading(true)
    setError(null)
    Promise.all([getPeriodConfig(), getClosedPeriods()])
      .then(([cfg, closed]) => {
        setConfig(cfg)
        setClosedPeriods(closed)
      })
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : 'Failed to load period data.')
      )
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [])

  async function handleInitiateClose(year: number, month: number) {
    setActivePeriod({ year, month })
    setActionError(null)
    setPendingDraft(null)
    setSuccessMsg(null)
    setGenerating(true)
    try {
      const result = await generateClosingEntry(year, month)
      setPendingDraft(result)
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : 'Failed to generate closing entry.')
    } finally {
      setGenerating(false)
    }
  }

  async function handleConfirmClose() {
    if (!pendingDraft || !activePeriod) return
    setPosting(true)
    setActionError(null)
    try {
      await postClosingEntry(pendingDraft.draftId, activePeriod.year, activePeriod.month)
      setSuccessMsg(
        `${formatMonth(activePeriod.year, activePeriod.month)} has been closed. ` +
        `Net income of ${formatCurrency(pendingDraft.netIncome)} was transferred to retained earnings.`
      )
      setPendingDraft(null)
      setActivePeriod(null)
      // Reload the closed periods list so the UI updates.
      const closed = await getClosedPeriods()
      setClosedPeriods(closed)
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : 'Failed to post closing entry.')
    } finally {
      setPosting(false)
    }
  }

  function handleCancelClose() {
    setActivePeriod(null)
    setPendingDraft(null)
    setActionError(null)
  }

  if (loading) {
    return (
      <div className="p-6 text-sm text-ash">Loading…</div>
    )
  }

  if (error) {
    return (
      <div className="p-6 text-sm text-red-300 bg-red-950/50 border border-red-800 rounded-md max-w-xl">
        {error}
      </div>
    )
  }

  const hasRetainedEarnings = config?.retainedEarningsAcctId

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-chalk">period close</h1>
        <p className="text-sm text-ash mt-1">
          Close an accounting period to lock it against further changes and transfer
          revenue and expense balances to retained earnings.
        </p>
      </div>

      {/* Config warning */}
      {!hasRetainedEarnings && (
        <div className="bg-amber-950/50 border border-amber-700 rounded-lg px-5 py-4 flex gap-3">
          <span className="text-amber-400 shrink-0 mt-0.5">⚠</span>
          <div>
            <p className="text-sm text-amber-300 font-medium">Retained earnings account not set</p>
            <p className="text-sm text-ash mt-1 leading-relaxed">
              Before closing a period, go to{' '}
              <a href="/settings" className="text-neon hover:underline">Settings → Accounting</a>{' '}
              and select the equity account that should receive net income at period end.
            </p>
          </div>
        </div>
      )}

      {/* Success banner */}
      {successMsg && (
        <div className="bg-emerald-950/50 border border-emerald-800 rounded-lg px-5 py-4">
          <p className="text-sm text-emerald-300">{successMsg}</p>
        </div>
      )}

      {/* Confirm close panel */}
      {pendingDraft && activePeriod && (
        <div className="bg-surface border border-neon/30 rounded-xl p-5 space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-chalk">
              Review closing entry — {formatMonth(activePeriod.year, activePeriod.month)}
            </h2>
            <p className="text-sm text-ash mt-1 leading-relaxed">
              A draft closing entry has been created with {pendingDraft.lineCount} line
              {pendingDraft.lineCount !== 1 ? 's' : ''}. Net income for the period is{' '}
              <span className={pendingDraft.netIncome >= 0 ? 'text-emerald-300' : 'text-red-400'}>
                {formatCurrency(pendingDraft.netIncome)}
              </span>
              . Posting this entry will lock the period against further changes.
            </p>
            <p className="text-xs text-ash mt-2">
              Draft ID: <span className="text-chalk font-mono">{pendingDraft.draftId}</span>
              {' — '}you can review this draft in the{' '}
              <a href="/drafts" className="text-neon hover:underline">Drafts</a> page before confirming.
            </p>
          </div>
          {actionError && (
            <div className="text-sm text-red-300 bg-red-950/50 border border-red-800 px-3 py-2 rounded-md">
              {actionError}
            </div>
          )}
          <div className="flex gap-3">
            <button
              onClick={handleConfirmClose}
              disabled={posting}
              className="px-4 py-2 text-sm font-medium rounded-md bg-neon/10 border border-neon/40 text-neon hover:bg-neon/20 disabled:opacity-50 transition-colors"
            >
              {posting ? 'Posting…' : 'Post and close period'}
            </button>
            <button
              onClick={handleCancelClose}
              disabled={posting}
              className="px-4 py-2 text-sm text-ash hover:text-chalk transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Generating spinner (no draft yet) */}
      {generating && activePeriod && !pendingDraft && (
        <div className="text-sm text-ash px-1">
          Generating closing entry for {formatMonth(activePeriod.year, activePeriod.month)}…
        </div>
      )}

      {/* Action error (generation failed) */}
      {actionError && !pendingDraft && (
        <div className="text-sm text-red-300 bg-red-950/50 border border-red-800 px-4 py-3 rounded-md">
          {actionError}
          <button
            onClick={() => setActionError(null)}
            className="ml-3 text-xs text-red-400 hover:text-red-300 underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Period list */}
      <div>
        <h2 className="text-sm font-semibold text-chalk mb-3">Last 12 months</h2>
        <div className="bg-surface border border-rim rounded-lg divide-y divide-rim">
          {months.map(({ year, month }) => {
            const status = getStatus(year, month)
            const isActive =
              activePeriod?.year === year && activePeriod?.month === month
            const closedRecord = closedPeriods.find((p) => p.year === year && p.month === month)

            return (
              <div
                key={`${year}-${month}`}
                className={`flex items-center justify-between px-5 py-3.5 ${isActive ? 'bg-raised' : ''}`}
              >
                <div className="flex items-center gap-4">
                  <span className="text-sm text-chalk w-40">{formatMonth(year, month)}</span>
                  <StatusBadge status={status} />
                  {closedRecord && (
                    <span className="text-xs text-ash">
                      closed {new Date(closedRecord.closedAt).toLocaleDateString()}
                    </span>
                  )}
                </div>

                {status === 'open' && hasRetainedEarnings && !isActive && (
                  <button
                    onClick={() => handleInitiateClose(year, month)}
                    disabled={generating || posting}
                    className="text-xs font-medium text-neon border border-neon/40 px-3 py-1.5 rounded hover:bg-neon/10 disabled:opacity-40 transition-colors"
                  >
                    Close →
                  </button>
                )}

                {status === 'current' && hasRetainedEarnings && !isActive && (
                  <button
                    onClick={() => handleInitiateClose(year, month)}
                    disabled={generating || posting}
                    className="text-xs font-medium text-amber-300 border border-amber-700/50 px-3 py-1.5 rounded hover:bg-amber-950/40 disabled:opacity-40 transition-colors"
                  >
                    Close current →
                  </button>
                )}

                {isActive && !pendingDraft && !generating && (
                  <span className="text-xs text-ash">see above</span>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Closed periods history */}
      {closedPeriods.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-chalk mb-1">Closed periods</h2>
          <p className="text-xs text-ash mb-3">
            Entries dated in a closed period cannot be posted. To reopen a period, delete
            the corresponding closing entry from the entries list.
          </p>
          <div className="bg-surface border border-rim rounded-lg divide-y divide-rim">
            {closedPeriods.map((p) => (
              <div key={p.id} className="flex items-center justify-between px-5 py-3 text-sm">
                <span className="text-chalk">{formatMonth(p.year, p.month)}</span>
                <span className="text-xs text-ash">
                  entry <span className="font-mono text-chalk">{p.entryId.slice(0, 8)}…</span>
                  {' · '}
                  {new Date(p.closedAt).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
