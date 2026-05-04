// src/ui/components/RecurringTemplateModal.tsx
import { useState, useEffect } from 'react'
import { listAccounts, createRecurringTemplate, updateRecurringTemplate, type RecurringTemplate, type Account } from '../api/client'

interface Props {
  initial: RecurringTemplate | null
  onClose: () => void
  onSaved: () => void
}

interface LineRow { accountId: string; type: 'debit' | 'credit'; amount: string }

export default function RecurringTemplateModal({ initial, onClose, onSaved }: Props) {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [name, setName] = useState(initial?.name ?? '')
  const [memo, setMemo] = useState(initial?.memo ?? '')
  const [paymentMethod, setPaymentMethod] = useState(initial?.paymentMethod ?? '')
  const [schedule, setSchedule] = useState<'weekly'|'monthly'|'quarterly'|'annually'|'custom'>(initial?.schedule ?? 'monthly')
  const [nextDue, setNextDue] = useState(initial?.nextDue?.slice(0, 10) ?? new Date().toISOString().slice(0, 10))
  const [autoPost, setAutoPost] = useState(initial?.autoPost ?? false)
  const [lines, setLines] = useState<LineRow[]>(
    initial?.lines?.map((l) => ({ accountId: l.accountId, type: l.type, amount: String(l.amount) })) ??
    [{ accountId: '', type: 'debit', amount: '' }, { accountId: '', type: 'credit', amount: '' }]
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listAccounts().then(setAccounts)
  }, [])

  function updateLine(i: number, field: keyof LineRow, value: string) {
    setLines((prev) => prev.map((l, idx) => idx === i ? { ...l, [field]: value } : l))
  }

  async function handleSave() {
    setError(null)
    if (!name.trim() || !memo.trim()) { setError('Name and memo are required.'); return }
    const parsedLines = lines.map((l) => ({ ...l, amount: parseFloat(l.amount) }))
    if (parsedLines.some((l) => !l.accountId || isNaN(l.amount) || l.amount <= 0)) {
      setError('All lines need an account and a positive amount.'); return
    }
    setSaving(true)
    try {
      const payload = { name, memo, paymentMethod: paymentMethod || undefined, schedule, nextDue, autoPost, lines: parsedLines }
      if (initial) {
        await updateRecurringTemplate(initial.id, payload)
      } else {
        await createRecurringTemplate(payload)
      }
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-surface border border-rim rounded-sm w-full max-w-lg p-6 space-y-4">
        <h2 className="text-chalk font-semibold">{initial ? 'Edit Template' : 'New Recurring Template'}</h2>

        {error && <p className="text-red-400 text-xs">{error}</p>}

        <div className="space-y-3">
          <div>
            <label className="text-ash text-xs block mb-1">Template Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)}
              className="w-full bg-raised border border-rim rounded-sm px-3 py-1.5 text-chalk text-sm focus:outline-none focus:border-neon" />
          </div>
          <div>
            <label className="text-ash text-xs block mb-1">Memo</label>
            <input value={memo} onChange={(e) => setMemo(e.target.value)}
              className="w-full bg-raised border border-rim rounded-sm px-3 py-1.5 text-chalk text-sm focus:outline-none focus:border-neon" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-ash text-xs block mb-1">Schedule</label>
              <select value={schedule} onChange={(e) => setSchedule(e.target.value as typeof schedule)}
                className="w-full bg-raised border border-rim rounded-sm px-3 py-1.5 text-chalk text-sm focus:outline-none focus:border-neon">
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="annually">Annually</option>
                <option value="custom">Custom</option>
              </select>
            </div>
            <div>
              <label className="text-ash text-xs block mb-1">Next Due</label>
              <input type="date" value={nextDue} onChange={(e) => setNextDue(e.target.value)}
                className="w-full bg-raised border border-rim rounded-sm px-3 py-1.5 text-chalk text-sm focus:outline-none focus:border-neon" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="autoPost" checked={autoPost} onChange={(e) => setAutoPost(e.target.checked)}
              className="accent-neon" />
            <label htmlFor="autoPost" className="text-ash text-xs">Auto-post (skip draft review)</label>
          </div>
        </div>

        <div>
          <label className="text-ash text-xs block mb-2">Lines</label>
          <div className="space-y-2">
            {lines.map((line, i) => (
              <div key={i} className="grid grid-cols-[1fr_80px_90px_24px] gap-2 items-center">
                <select value={line.accountId} onChange={(e) => updateLine(i, 'accountId', e.target.value)}
                  className="bg-raised border border-rim rounded-sm px-2 py-1 text-chalk text-xs focus:outline-none focus:border-neon">
                  <option value="">Account</option>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.number} — {a.name}</option>)}
                </select>
                <select value={line.type} onChange={(e) => updateLine(i, 'type', e.target.value as 'debit'|'credit')}
                  className="bg-raised border border-rim rounded-sm px-2 py-1 text-chalk text-xs focus:outline-none focus:border-neon">
                  <option value="debit">Dr</option>
                  <option value="credit">Cr</option>
                </select>
                <input type="number" step="0.01" min="0" value={line.amount}
                  onChange={(e) => updateLine(i, 'amount', e.target.value)}
                  placeholder="0.00"
                  className="bg-raised border border-rim rounded-sm px-2 py-1 text-chalk text-xs focus:outline-none focus:border-neon text-right" />
                <button onClick={() => setLines((prev) => prev.filter((_, idx) => idx !== i))}
                  className="text-ash hover:text-red-400 text-xs">&#x2715;</button>
              </div>
            ))}
          </div>
          <button onClick={() => setLines((prev) => [...prev, { accountId: '', type: 'debit', amount: '' }])}
            className="text-ash hover:text-chalk text-xs mt-2 transition-colors">+ Add line</button>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button onClick={onClose} className="text-ash hover:text-chalk text-sm transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="bg-neon hover:bg-neon-dim text-void text-xs font-semibold px-4 py-1.5 rounded-sm transition-colors disabled:opacity-50">
            {saving ? 'Saving\u2026' : 'Save Template'}
          </button>
        </div>
      </div>
    </div>
  )
}
