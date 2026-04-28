import { useState, useEffect, Fragment } from 'react'
import { api, Account, DraftEntryInput } from '../api/client'

interface Line {
  accountId: string
  debit: string
  credit: string
}

interface Props {
  onClose: () => void
  onPosted: () => void
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

const emptyLine = (): Line => ({ accountId: '', debit: '', credit: '' })

export default function NewEntryModal({ onClose, onPosted }: Props) {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [date, setDate] = useState(today())
  const [memo, setMemo] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('')
  const [lines, setLines] = useState<Line[]>([emptyLine(), emptyLine()])
  const [draftId, setDraftId] = useState<string | undefined>()
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
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
          <h2 className="text-base font-semibold text-slate-900">New Journal Entry</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-lg leading-none"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
          {/* Date / payment method */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Date</label>
              <input
                type="date"
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Payment Method <span className="font-normal text-slate-400">(optional)</span>
              </label>
              <input
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g. ACH, Check, Cash"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
              />
            </div>
          </div>

          {/* Memo */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Memo</label>
            <input
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Description of this entry"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
            />
          </div>

          {/* Lines table */}
          <div>
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-slate-50">
                  <th className="text-left px-3 py-2 font-medium text-slate-600 border border-slate-200 rounded-tl-md w-1/2">
                    Account
                  </th>
                  <th className="text-right px-3 py-2 font-medium text-slate-600 border-t border-b border-slate-200 w-1/4">
                    Debit
                  </th>
                  <th className="text-right px-3 py-2 font-medium text-slate-600 border border-slate-200 rounded-tr-md w-1/4">
                    Credit
                  </th>
                  <th className="w-8 border-t border-b border-slate-200" />
                </tr>
              </thead>
              <tbody>
                {lines.map((line, i) => (
                  <Fragment key={i}>
                    <tr className="border-b border-slate-100">
                      <td className="px-1 py-1 border-l border-slate-200">
                        <select
                          className="w-full px-2 py-1.5 text-sm rounded focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
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
                          className="w-full px-2 py-1.5 text-sm text-right rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                      <td className="px-1 py-1 border-r border-slate-200">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className="w-full px-2 py-1.5 text-sm text-right rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                      <td className="px-1 py-1 text-center border-r border-slate-200">
                        {lines.length > 2 && (
                          <button
                            onClick={() => removeLine(i)}
                            className="text-slate-300 hover:text-red-500 px-1 transition-colors"
                          >
                            ✕
                          </button>
                        )}
                      </td>
                    </tr>
                  </Fragment>
                ))}
                {/* Totals */}
                <tr className="border-t-2 border-slate-300 bg-slate-50">
                  <td className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide border-l border-b border-slate-200">
                    Total
                  </td>
                  <td
                    className={`px-3 py-2 text-right font-mono text-sm font-semibold border-b border-slate-200 ${
                      !balanced && totalDebits > 0 ? 'text-red-600' : 'text-slate-800'
                    }`}
                  >
                    {totalDebits > 0 ? fmt(totalDebits) : ''}
                  </td>
                  <td
                    className={`px-3 py-2 text-right font-mono text-sm font-semibold border-b border-r border-slate-200 ${
                      !balanced && totalCredits > 0 ? 'text-red-600' : 'text-slate-800'
                    }`}
                  >
                    {totalCredits > 0 ? fmt(totalCredits) : ''}
                  </td>
                  <td className="border-b border-r border-slate-200" />
                </tr>
              </tbody>
            </table>

            <button
              onClick={addLine}
              className="mt-2 text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors"
            >
              + Add line
            </button>
          </div>

          {/* Balance indicator */}
          {totalDebits > 0 && !balanced && (
            <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-3 py-2 rounded-md">
              Debits and credits must match before posting. Difference:{' '}
              {fmt(Math.abs(totalDebits - totalCredits))}
            </div>
          )}
          {balanced && (
            <div className="text-xs text-green-700 bg-green-50 border border-green-200 px-3 py-2 rounded-md">
              Entry is balanced. Ready to post.
            </div>
          )}

          {error && (
            <div className="text-xs text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded-md">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 shrink-0">
          <button
            onClick={onClose}
            className="text-sm text-slate-500 hover:text-slate-700 transition-colors"
          >
            Cancel
          </button>
          <div className="flex gap-3">
            <button
              onClick={handleSaveDraft}
              disabled={saving}
              className="border border-slate-300 hover:bg-slate-50 disabled:opacity-50 text-slate-700 text-sm font-medium px-4 py-2 rounded-md transition-colors"
            >
              Save Draft
            </button>
            <button
              onClick={handlePost}
              disabled={saving || !balanced}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm font-semibold px-4 py-2 rounded-md transition-colors"
            >
              Post Entry
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
