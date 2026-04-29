import { useState } from 'react'
import { api, Account, AccountType, CreateAccountInput } from '../api/client'

const ACCOUNT_TYPES: AccountType[] = ['Asset', 'Liability', 'Equity', 'Revenue', 'Expense']

const DEFAULT_NORMAL_BALANCE: Record<AccountType, 'debit' | 'credit'> = {
  Asset: 'debit',
  Expense: 'debit',
  Liability: 'credit',
  Equity: 'credit',
  Revenue: 'credit',
}

interface Props {
  onClose: () => void
  onCreated: (account: Account) => void
}

const inputClass =
  'w-full bg-raised border border-rim text-chalk placeholder:text-ash rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neon focus:border-neon'

export default function NewAccountModal({ onClose, onCreated }: Props) {
  const [form, setForm] = useState<CreateAccountInput>({
    number: '',
    name: '',
    type: 'Asset',
    normalBalance: 'debit',
    isContra: false,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleTypeChange(type: AccountType) {
    setForm((f) => ({ ...f, type, normalBalance: DEFAULT_NORMAL_BALANCE[type] }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const account = await api.accounts.create(form)
      onCreated(account)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to create account.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-surface border border-rim rounded-xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-rim">
          <h2 className="text-base font-semibold text-chalk">New Account</h2>
          <button
            onClick={onClose}
            className="text-ash hover:text-chalk text-lg leading-none transition-colors"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-ash mb-1">Account Number</label>
              <input
                className={inputClass}
                placeholder="1000"
                value={form.number}
                onChange={(e) => setForm((f) => ({ ...f, number: e.target.value }))}
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-ash mb-1">Account Name</label>
              <input
                className={inputClass}
                placeholder="Cash"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-ash mb-1">Type</label>
            <select
              className="w-full bg-raised border border-rim text-chalk rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neon"
              value={form.type}
              onChange={(e) => handleTypeChange(e.target.value as AccountType)}
            >
              {ACCOUNT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-ash mb-2">Normal Balance</label>
            <div className="flex gap-6">
              {(['debit', 'credit'] as const).map((nb) => (
                <label
                  key={nb}
                  className="flex items-center gap-2 text-sm text-chalk cursor-pointer"
                >
                  <input
                    type="radio"
                    name="normalBalance"
                    value={nb}
                    checked={form.normalBalance === nb}
                    onChange={() => setForm((f) => ({ ...f, normalBalance: nb }))}
                    className="accent-neon"
                  />
                  {nb.charAt(0).toUpperCase() + nb.slice(1)}
                </label>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.isContra}
              onChange={(e) => setForm((f) => ({ ...f, isContra: e.target.checked }))}
              className="rounded accent-neon"
            />
            <span className="text-sm text-chalk">Contra account</span>
          </label>

          {error && (
            <div className="text-xs text-red-300 bg-red-950/50 border border-red-800 px-3 py-2 rounded-md">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="text-sm text-ash hover:text-chalk px-3 py-2 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="bg-neon hover:bg-neon-dim disabled:opacity-50 text-void text-sm font-bold px-4 py-2 rounded-md transition-colors"
            >
              {saving ? 'Creating…' : 'Create Account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
