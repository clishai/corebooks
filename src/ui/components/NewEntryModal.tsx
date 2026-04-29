import { useState, useEffect, Fragment } from 'react'
import { api, Account, DraftEntryInput, JournalEntry } from '../api/client'

interface Line {
  accountId: string
  debit: string
  credit: string
}

interface Props {
  onClose: () => void
  onPosted: () => void
  initialDraft?: JournalEntry
  onAutoSaved?: () => void
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function fmt(amount: number): string {
  return amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

function toApiLines(lines: Line[]): DraftEntryInput['lines'] {
  return lines
    .filter((l) => l.accountId && (l.debit || l.credit))
    .map((l) =>
      l.debit
        ? { accountId: l.accountId, amount: parseFloat(l.debit), type: 'debit' as const }
        : { accountId: l.accountId, amount: parseFloat(l.credit), type: 'credit' as const },
    )
}

function fromInitialLines(entry: JournalEntry): Line[] {
  if (!entry.lines.length) return [emptyLine(), emptyLine()]
  return entry.lines.map((l) => ({
    accountId: l.accountId,
    debit: l.type === 'debit' ? String(l.amount) : '',
    credit: l.type === 'credit' ? String(l.amount) : '',
  }))
}

const emptyLine = (): Line => ({ accountId: '', debit: '', credit: '' })

function hasContent(memo: string, lines: Line[]): boolean {
  if (memo.trim()) return true
  return lines.some((l) => l.accountId || l.debit || l.credit)
}

const inputClass =
  'w-full bg-raised border border-rim text-chalk placeholder:text-ash rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-neon focus:border-neon'

export default function NewEntryModal({ onClose, onPosted, initialDraft, onAutoSaved }: Props) {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [date, setDate] = useState(initialDraft ? initialDraft.date.slice(0, 10) : today())
  const [memo, setMemo] = useState(initialDraft?.memo ?? '')
  const [paymentMethod, setPaymentMethod] = useState(initialDraft?.paymentMethod ?? '')
  const [lines, setLines] = useState<Line[]>(
    initialDraft ? fromInitialLines(initialDraft) : [emptyLine(), emptyLine()],
  )
  const [draftId, setDraftId] = useState<string | undefined>(initialDraft?.id)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.accounts.list().then(setAccounts).catch(() => {})
  }, [])

  const totalDebits = lines.reduce((s, l) => s + (parseFloat(l.debit) || 0), 0)
  const totalCredits = lines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0)
  const balanced = totalDebits > 0 && Math.abs(totalDebits - totalCredits) < 0.001

  function setLine(i: number, patch: Partial<Line>) {
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))
  }

  function addLine() {
    setLines((ls) => [...ls, emptyLine()])
  }

  function removeLine(i: number) {
    setLines((ls) => ls.filter((_, idx) => idx !== i))
  }

  function buildDraft(): DraftEntryInput {
    return {
      id: draftId,
      date,
      memo,
      paymentMethod: paymentMethod.trim() || undefined,
      lines: toApiLines(lines),
    }
  }

  // Auto-saves if the form has content, then calls onClose.
  // Used for backdrop clicks and the Cancel button so no work is ever lost.
  async function handleClose() {
    if (hasContent(memo, lines)) {
      try {
        const saved = await api.entries.saveDraft(buildDraft())
        setDraftId(saved.id)
        onAutoSaved?.()
      } catch {
        // Auto-save failure is silent — we still close and don't lose the attempt.
      }
    }
    onClose()
  }

  async function handleSaveDraft() {
    setSaving(true)
    setError(null)
    try {
      const saved = await api.entries.saveDraft(buildDraft())
      setDraftId(saved.id)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save draft.')
    } finally {
      setSaving(false)
    }
  }

  async function handlePost() {
    setSaving(true)
    setError(null)
    try {
      // Always sync current form state to the draft before posting, so edits
      // made after a prior Save Draft are not silently discarded.
      const saved = await api.entries.saveDraft(buildDraft())
      setDraftId(saved.id)
      await api.entries.post(saved.id!)
      onPosted()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to post entry.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
      onMouseDown={(e) => e.target === e.currentTarget && handleClose()}
    >
      <div className="bg-surface border border-rim rounded-xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-rim shrink-0">
          <h2 className="text-base font-semibold text-chalk">
            {initialDraft ? 'Edit Draft' : 'New Journal Entry'}
          </h2>
          <button
            onClick={handleClose}
            className="text-ash hover:text-chalk text-lg leading-none transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
          {/* Date / payment method */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-ash mb-1">Date</label>
              <input
                type="date"
                className={inputClass}
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-ash mb-1">
                Payment Method{' '}
                <span className="font-normal text-ash/60">(optional)</span>
              </label>
              <input
                className={inputClass}
                placeholder="e.g. ACH, Check, Cash"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
              />
            </div>
          </div>

          {/* Memo */}
          <div>
            <label className="block text-xs font-medium text-ash mb-1">Memo</label>
            <input
              className={inputClass}
              placeholder="Description of this entry"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
            />
          </div>

          {/* Lines table */}
          <div>
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-raised">
                  <th className="text-left px-3 py-2 font-medium text-ash border border-rim rounded-tl-md w-1/2">
                    Account
                  </th>
                  <th className="text-right px-3 py-2 font-medium text-ash border-t border-b border-rim w-1/4">
                    Debit
                  </th>
                  <th className="text-right px-3 py-2 font-medium text-ash border border-rim rounded-tr-md w-1/4">
                    Credit
                  </th>
                  <th className="w-8 border-t border-b border-rim" />
                </tr>
              </thead>
              <tbody>
                {lines.map((line, i) => (
                  <Fragment key={i}>
                    <tr className="border-b border-rim">
                      <td className="px-1 py-1 border-l border-rim">
                        <select
                          className="w-full px-2 py-1.5 text-sm rounded bg-raised text-chalk focus:outline-none focus:ring-2 focus:ring-neon"
                          value={line.accountId}
                          onChange={(e) => setLine(i, { accountId: e.target.value })}
                        >
                          <option value="">— select —</option>
                          {accounts.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.number} {a.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-1 py-1">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className="w-full px-2 py-1.5 text-sm text-right bg-transparent text-chalk placeholder:text-ash rounded focus:outline-none focus:ring-2 focus:ring-neon"
                          placeholder="0.00"
                          value={line.debit}
                          onChange={(e) =>
                            setLine(i, {
                              debit: e.target.value,
                              credit: e.target.value ? '' : line.credit,
                            })
                          }
                        />
                      </td>
                      <td className="px-1 py-1 border-r border-rim">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className="w-full px-2 py-1.5 text-sm text-right bg-transparent text-chalk placeholder:text-ash rounded focus:outline-none focus:ring-2 focus:ring-neon"
                          placeholder="0.00"
                          value={line.credit}
                          onChange={(e) =>
                            setLine(i, {
                              credit: e.target.value,
                              debit: e.target.value ? '' : line.debit,
                            })
                          }
                        />
                      </td>
                      <td className="px-1 py-1 text-center border-r border-rim">
                        {lines.length > 2 && (
                          <button
                            onClick={() => removeLine(i)}
                            className="text-ash hover:text-red-400 px-1 transition-colors"
                          >
                            ✕
                          </button>
                        )}
                      </td>
                    </tr>
                  </Fragment>
                ))}
                {/* Totals */}
                <tr className="border-t-2 border-rim bg-raised">
                  <td className="px-3 py-2 text-xs font-semibold text-ash uppercase tracking-wide border-l border-b border-rim">
                    Total
                  </td>
                  <td
                    className={`px-3 py-2 text-right font-mono text-sm font-semibold border-b border-rim ${
                      !balanced && totalDebits > 0 ? 'text-red-400' : 'text-chalk'
                    }`}
                  >
                    {totalDebits > 0 ? fmt(totalDebits) : ''}
                  </td>
                  <td
                    className={`px-3 py-2 text-right font-mono text-sm font-semibold border-b border-r border-rim ${
                      !balanced && totalCredits > 0 ? 'text-red-400' : 'text-chalk'
                    }`}
                  >
                    {totalCredits > 0 ? fmt(totalCredits) : ''}
                  </td>
                  <td className="border-b border-r border-rim" />
                </tr>
              </tbody>
            </table>

            <button
              onClick={addLine}
              className="mt-2 text-xs font-medium text-neon hover:text-neon-dim transition-colors"
            >
              + Add line
            </button>
          </div>

          {/* Balance indicator */}
          {totalDebits > 0 && !balanced && (
            <div className="text-xs text-amber-300 bg-amber-950/50 border border-amber-800 px-3 py-2 rounded-md">
              Debits and credits must match before posting. Difference:{' '}
              {fmt(Math.abs(totalDebits - totalCredits))}
            </div>
          )}
          {balanced && (
            <div className="text-xs text-emerald-300 bg-emerald-950/50 border border-emerald-800 px-3 py-2 rounded-md">
              Entry is balanced. Ready to post.
            </div>
          )}

          {error && (
            <div className="text-xs text-red-300 bg-red-950/50 border border-red-800 px-3 py-2 rounded-md">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-rim shrink-0">
          <button
            onClick={handleClose}
            className="text-sm text-ash hover:text-chalk transition-colors"
          >
            Cancel
          </button>
          <div className="flex gap-3">
            <button
              onClick={handleSaveDraft}
              disabled={saving}
              className="border border-rim hover:bg-raised disabled:opacity-50 text-chalk text-sm font-medium px-4 py-2 rounded-md transition-colors"
            >
              Save Draft
            </button>
            <button
              onClick={handlePost}
              disabled={saving || !balanced}
              className="bg-neon hover:bg-neon-dim disabled:opacity-40 text-void text-sm font-bold px-4 py-2 rounded-md transition-colors"
            >
              Post Entry
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
