import { useState, useEffect } from 'react'
import { getPeriodConfig, savePeriodConfig, listAccounts, Account, PeriodConfig } from '../../api/client'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export default function AccountingTab() {
  const [config, setConfig] = useState<PeriodConfig>({
    fiscalYearEndMonth: 12,
    fiscalYearEndDay: 31,
    closeFrequency: 'year-end',
    retainedEarningsAcctId: null,
  })
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    Promise.all([getPeriodConfig(), listAccounts()])
      .then(([cfg, accts]) => {
        setConfig(cfg)
        setAccounts(accts)
      })
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : 'Failed to load accounting settings.')
      )
      .finally(() => setLoading(false))
  }, [])

  const equityAccounts = accounts.filter((a) => a.type === 'Equity' && !a.isContra)

  async function handleSave() {
    setSaving(true)
    setSaved(false)
    setError(null)
    try {
      const updated = await savePeriodConfig(config)
      setConfig(updated)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save settings.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p className="text-sm text-ash">Loading…</p>

  return (
    <div className="space-y-8">

      {error && (
        <div className="text-sm text-red-300 bg-red-950/50 border border-red-800 px-4 py-3 rounded-md">
          {error}
        </div>
      )}

      {/* Fiscal year end */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-chalk">Fiscal year end</h3>
        <p className="text-sm text-ash leading-relaxed">
          The month and day on which your fiscal year ends. Defaults to December 31 (calendar year).
        </p>
        <div className="flex gap-3 items-center">
          <select
            value={config.fiscalYearEndMonth}
            onChange={(e) => setConfig({ ...config, fiscalYearEndMonth: Number(e.target.value) })}
            className="bg-raised border border-rim rounded-md px-3 py-2 text-chalk text-sm focus:outline-none focus:border-neon"
          >
            {MONTH_NAMES.map((name, i) => (
              <option key={i + 1} value={i + 1}>{name}</option>
            ))}
          </select>
          <input
            type="number"
            min={1}
            max={31}
            value={config.fiscalYearEndDay}
            onChange={(e) => setConfig({ ...config, fiscalYearEndDay: Number(e.target.value) })}
            className="w-20 bg-raised border border-rim rounded-md px-3 py-2 text-chalk text-sm focus:outline-none focus:border-neon"
          />
          <span className="text-xs text-ash">day</span>
        </div>
      </div>

      {/* Close frequency */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-chalk">Close frequency</h3>
        <p className="text-sm text-ash leading-relaxed">
          How often you perform a period close. Most businesses close annually; some close monthly.
        </p>
        <div className="flex gap-2">
          {(['year-end', 'month-end'] as const).map((freq) => (
            <button
              key={freq}
              onClick={() => setConfig({ ...config, closeFrequency: freq })}
              className={`px-4 py-2 text-sm rounded-md border transition-colors ${
                config.closeFrequency === freq
                  ? 'bg-neon/10 border-neon text-neon'
                  : 'border-rim text-ash hover:text-chalk hover:border-chalk/30'
              }`}
            >
              {freq === 'year-end' ? 'Annual (year-end)' : 'Monthly'}
            </button>
          ))}
        </div>
      </div>

      {/* Retained earnings account */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-chalk">Retained earnings account</h3>
        <p className="text-sm text-ash leading-relaxed">
          The equity account that receives net income when you close a period. This is typically
          called "Retained Earnings" or "Owner's Equity".
        </p>
        {equityAccounts.length === 0 ? (
          <p className="text-sm text-amber-300 bg-amber-950/40 border border-amber-700/50 px-4 py-3 rounded-md">
            No equity accounts found. Add an Equity account in the chart of accounts first.
          </p>
        ) : (
          <select
            value={config.retainedEarningsAcctId ?? ''}
            onChange={(e) =>
              setConfig({ ...config, retainedEarningsAcctId: e.target.value || null })
            }
            className="w-full bg-raised border border-rim rounded-md px-3 py-2 text-chalk text-sm focus:outline-none focus:border-neon"
          >
            <option value="">— select an account —</option>
            {equityAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.number} — {a.name}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 text-sm font-medium rounded-md border border-neon/40 text-neon hover:bg-neon/10 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save'}
        </button>
      </div>

    </div>
  )
}
