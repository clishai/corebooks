import { useState, useEffect } from 'react'
import { api, DatabaseSettings, DbStats, getPeriodConfig, savePeriodConfig, listAccounts, Account, PeriodConfig } from '../api/client'
import { ACCOUNT_TEMPLATES, type AccountTemplate } from '../lib/accountTemplates'
import { ALL_METRICS, MetricId, getSelectedMetrics, saveSelectedMetrics, HomeLayout, getHomeLayout, saveHomeLayout } from '../lib/metrics'
import { SNOOZE_OPTIONS, getSnoozeDuration, saveSnoozeDuration } from '../lib/alerts'
import { ALL_ACCOUNT_COLUMNS, AccountColumnId, getVisibleColumns, saveVisibleColumns } from '../lib/accountColumns'
import { getPaymentMethods, savePaymentMethods } from '../lib/paymentMethods'
import { encryptExport } from '../lib/crypto'
import ExportPasswordModal from '../components/ExportPasswordModal'
import ImportModal from '../components/ImportModal'
import ShortcutRecorder from '../components/ShortcutRecorder'
import {
  getShortcuts,
  saveShortcuts,
  SHORTCUT_LABELS,
  findConflict,
  type ShortcutId,
  type ShortcutBinding,
} from '../lib/shortcuts'

type Tab = 'home' | 'accounts' | 'payment-methods' | 'accounting' | 'shortcuts' | 'database'

// ── Home page tab ────────────────────────────────────────────────────────────

function HomePageSettings() {
  const [companyName, setCompanyName] = useState(() => localStorage.getItem('cb_company_name') ?? '')
  const [companySaved, setCompanySaved] = useState(false)
  const [selected, setSelected] = useState<MetricId[]>(getSelectedMetrics)
  const [layout, setLayout] = useState<HomeLayout>(getHomeLayout)
  const [snooze, setSnooze] = useState<number | null>(getSnoozeDuration)

  function handleSaveCompanyName() {
    const trimmed = companyName.trim()
    if (trimmed) {
      localStorage.setItem('cb_company_name', trimmed)
    } else {
      localStorage.removeItem('cb_company_name')
    }
    window.dispatchEvent(new CustomEvent('cb:company-name-changed'))
    setCompanySaved(true)
    setTimeout(() => setCompanySaved(false), 2000)
  }

  function toggle(id: MetricId) {
    const next = selected.includes(id) ? selected.filter((m) => m !== id) : [...selected, id]
    setSelected(next)
    saveSelectedMetrics(next)
  }

  function handleLayout(l: HomeLayout) {
    setLayout(l)
    saveHomeLayout(l)
  }

  function handleSnooze(ms: number | null) {
    setSnooze(ms)
    saveSnoozeDuration(ms)
  }

  return (
    <div className="space-y-8">

      {/* Business name */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-chalk">Business name</h3>
        <p className="text-sm text-ash leading-relaxed">
          Appears in the top bar of the app.
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={companyName}
            onChange={(e) => { setCompanyName(e.target.value); setCompanySaved(false) }}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSaveCompanyName() }}
            placeholder="e.g. Acme Corp"
            className="flex-1 bg-raised border border-rim rounded-md px-3 py-2 text-chalk placeholder:text-ash focus:outline-none focus:border-neon text-sm"
          />
          <button
            onClick={handleSaveCompanyName}
            className="px-4 py-2 text-sm font-medium rounded-md border border-neon/40 text-neon hover:bg-neon/10 transition-colors shrink-0"
          >
            {companySaved ? 'Saved ✓' : 'Save'}
          </button>
        </div>
      </div>

      {/* Card size */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-chalk">Metric card size</h3>
        <div className="flex gap-2">
          {(['compact', 'comfortable'] as HomeLayout[]).map((l) => (
            <button
              key={l}
              onClick={() => handleLayout(l)}
              className={`px-4 py-2 text-sm rounded-md border transition-colors ${
                layout === l
                  ? 'bg-neon/10 border-neon text-neon'
                  : 'border-rim text-ash hover:text-chalk hover:border-chalk/30'
              }`}
            >
              {l}
            </button>
          ))}
        </div>
        <p className="text-xs text-ash">
          Compact fits more cards per row. Comfortable gives each card more breathing room.
        </p>
      </div>

      {/* Metrics selection */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-chalk">Visible metrics</h3>
        <p className="text-sm text-ash leading-relaxed">
          Choose which metrics appear on your home page.
        </p>
        <div className="bg-surface border border-rim rounded-lg divide-y divide-rim">
          {ALL_METRICS.map((m) => {
            const checked = selected.includes(m.id)
            return (
              <label
                key={m.id}
                onClick={() => toggle(m.id)}
                className="flex items-center gap-4 px-5 py-3.5 cursor-pointer hover:bg-raised transition-colors"
              >
                <div
                  className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                    checked ? 'bg-neon border-neon' : 'border-rim bg-base'
                  }`}
                >
                  {checked && (
                    <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                      <path
                        d="M1 4L3.5 6.5L9 1"
                        stroke="#0a0c12"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </div>
                <span className="text-sm text-chalk">{m.label}</span>
              </label>
            )
          })}
        </div>
        <p className="text-xs text-ash">
          Changes save automatically and take effect the next time you visit the home page.
        </p>
      </div>

      {/* Alert reminder frequency */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-chalk">Alert reminders</h3>
        <p className="text-sm text-ash leading-relaxed">
          When you dismiss a home page alert, how long before it reappears?
        </p>
        <div className="bg-surface border border-rim rounded-lg divide-y divide-rim">
          {SNOOZE_OPTIONS.map((opt) => {
            const active = snooze === opt.ms
            return (
              <label
                key={String(opt.ms)}
                onClick={() => handleSnooze(opt.ms)}
                className="flex items-center gap-4 px-5 py-3 cursor-pointer hover:bg-raised transition-colors"
              >
                <div
                  className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 transition-colors ${
                    active ? 'border-neon' : 'border-rim'
                  }`}
                >
                  {active && <div className="w-2 h-2 rounded-full bg-neon" />}
                </div>
                <span className="text-sm text-chalk">{opt.label}</span>
              </label>
            )
          })}
        </div>
        <p className="text-xs text-ash">
          "Never" means dismissed alerts do not reappear until you clear your browser data.
        </p>
      </div>

    </div>
  )
}

// ── Accounts tab ─────────────────────────────────────────────────────────────

const LIBRARY_GROUPS: Array<{ label: string; type: AccountTemplate['type'] }> = [
  { label: 'Assets', type: 'Asset' },
  { label: 'Liabilities', type: 'Liability' },
  { label: 'Equity', type: 'Equity' },
  { label: 'Revenue', type: 'Revenue' },
  { label: 'Expenses', type: 'Expense' },
]

function AccountsSettings() {
  const [visible, setVisible] = useState<AccountColumnId[]>(getVisibleColumns)
  const [existingNumbers, setExistingNumbers] = useState<Set<string>>(new Set())
  const [addedNumbers, setAddedNumbers] = useState<Set<string>>(new Set())
  const [addingNumbers, setAddingNumbers] = useState<Set<string>>(new Set())
  const [expandedGroup, setExpandedGroup] = useState<AccountTemplate['type'] | null>(null)

  useEffect(() => {
    api.accounts.list()
      .then((accts) => setExistingNumbers(new Set(accts.map((a) => a.number))))
      .catch(() => {})
  }, [])

  function toggle(id: AccountColumnId) {
    const next = visible.includes(id) ? visible.filter((c) => c !== id) : [...visible, id]
    setVisible(next)
    saveVisibleColumns(next)
  }

  async function handleAddTemplate(t: AccountTemplate) {
    setAddingNumbers((prev) => new Set(prev).add(t.number))
    try {
      await api.accounts.create({
        number: t.number,
        name: t.name,
        type: t.type,
        normalBalance: t.normalBalance,
        isContra: t.isContra,
        contraTo: t.contraTo,
        classification: t.classification,
      })
      setAddedNumbers((prev) => new Set(prev).add(t.number))
    } catch {
      // skip duplicates
    } finally {
      setAddingNumbers((prev) => {
        const next = new Set(prev)
        next.delete(t.number)
        return next
      })
    }
  }

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-chalk">Visible columns</h3>
        <p className="text-sm text-ash leading-relaxed">
          Choose which columns appear in the chart of accounts. Account number and name are always shown.
        </p>
        <div className="bg-surface border border-rim rounded-lg divide-y divide-rim">
          {ALL_ACCOUNT_COLUMNS.map((col) => {
            const checked = visible.includes(col.id)
            return (
              <label
                key={col.id}
                onClick={() => toggle(col.id)}
                className="flex items-center gap-4 px-5 py-3.5 cursor-pointer hover:bg-raised transition-colors"
              >
                <div
                  className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                    checked ? 'bg-neon border-neon' : 'border-rim bg-base'
                  }`}
                >
                  {checked && (
                    <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                      <path
                        d="M1 4L3.5 6.5L9 1"
                        stroke="#0a0c12"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </div>
                <span className="text-sm text-chalk">{col.label}</span>
              </label>
            )
          })}
        </div>
        <p className="text-xs text-ash">
          Changes save automatically and take effect the next time you visit the accounts page.
        </p>
      </div>

      {/* Account Library */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-chalk">Account Library</h3>
        <p className="text-sm text-ash leading-relaxed">
          Add standard accounts to your chart of accounts. Expand a group to browse templates.
        </p>
        <div className="bg-surface border border-rim rounded-lg divide-y divide-rim">
          {LIBRARY_GROUPS.map(({ label, type }) => {
            const templates = ACCOUNT_TEMPLATES.filter((t) => t.type === type)
            const isExpanded = expandedGroup === type
            return (
              <div key={type}>
                <button
                  onClick={() => setExpandedGroup(isExpanded ? null : type)}
                  className="w-full flex items-center justify-between px-5 py-3 hover:bg-raised transition-colors"
                >
                  <span className="text-sm font-medium text-chalk">{label}</span>
                  <span className="text-ash text-xs">{isExpanded ? '▾' : '▸'}</span>
                </button>
                {isExpanded && (
                  <div className="border-t border-rim/50">
                    {templates.map((t) => {
                      const alreadyExists = existingNumbers.has(t.number) || addedNumbers.has(t.number)
                      const isAdding = addingNumbers.has(t.number)
                      return (
                        <div
                          key={t.number}
                          className="flex items-start justify-between px-5 py-2.5 border-b border-rim/30 last:border-0 hover:bg-raised/50"
                        >
                          <div className="flex-1 min-w-0 mr-3">
                            <div className="flex items-center gap-2">
                              <span className="text-ash text-xs font-mono">{t.number}</span>
                              <span className="text-chalk text-xs truncate">{t.name}</span>
                              {t.isContra && <span className="text-violet text-[10px]">contra</span>}
                            </div>
                            <p className="text-ash text-[10px] mt-0.5 line-clamp-1">{t.description}</p>
                          </div>
                          <button
                            onClick={() => !alreadyExists && handleAddTemplate(t)}
                            disabled={alreadyExists || isAdding}
                            className={`text-[10px] font-semibold shrink-0 px-2 py-1 rounded-sm border transition-colors ${
                              alreadyExists
                                ? 'border-rim text-ash cursor-default'
                                : 'border-neon text-neon hover:bg-neon hover:text-void'
                            }`}
                          >
                            {alreadyExists ? 'Added' : isAdding ? '…' : 'ADD+'}
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Payment methods tab ───────────────────────────────────────────────────────

function PaymentMethodsSettings() {
  const [methods, setMethods] = useState<string[]>(getPaymentMethods)
  const [newMethod, setNewMethod] = useState('')
  const [error, setError] = useState<string | null>(null)

  function handleAdd() {
    const trimmed = newMethod.trim()
    if (!trimmed) return
    if (methods.includes(trimmed)) {
      setError('That payment method already exists.')
      return
    }
    const next = [...methods, trimmed]
    setMethods(next)
    savePaymentMethods(next)
    setNewMethod('')
    setError(null)
  }

  function handleRemove(method: string) {
    const next = methods.filter((m) => m !== method)
    setMethods(next)
    savePaymentMethods(next)
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-chalk">Payment methods</h3>
        <p className="text-sm text-ash leading-relaxed">
          These appear as options in the journal entry form. Add or remove methods to match
          how your business actually moves money.
        </p>

        {methods.length > 0 ? (
          <div className="bg-surface border border-rim rounded-lg divide-y divide-rim">
            {methods.map((m) => (
              <div key={m} className="flex items-center justify-between px-5 py-3">
                <span className="text-sm text-chalk">{m}</span>
                <button
                  onClick={() => handleRemove(m)}
                  className="text-ash hover:text-red-400 text-xs transition-colors"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-surface border border-rim rounded-lg px-5 py-4 text-sm text-ash">
            No payment methods yet. Add one below.
          </div>
        )}
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-chalk">Add a method</h3>
        <div className="flex gap-2">
          <input
            type="text"
            value={newMethod}
            onChange={(e) => { setNewMethod(e.target.value); setError(null) }}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAdd() }}
            placeholder="e.g. Zelle, PayPal"
            className="flex-1 bg-raised border border-rim rounded-md px-3 py-2 text-chalk placeholder:text-ash focus:outline-none focus:border-neon text-sm"
          />
          <button
            onClick={handleAdd}
            className="px-4 py-2 text-sm font-medium rounded-md border border-neon/40 text-neon hover:bg-neon/10 transition-colors shrink-0"
          >
            Add
          </button>
        </div>
        {error && (
          <p className="text-xs text-red-400">{error}</p>
        )}
        <p className="text-xs text-ash">Changes take effect the next time you open the entry form.</p>
      </div>
    </div>
  )
}

// ── Accounting tab ────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function AccountingSettings() {
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

// ── Shortcuts tab ────────────────────────────────────────────────────────────

function ShortcutsSettings() {
  const [bindings, setBindings] = useState(() => getShortcuts())

  function handleChange(id: ShortcutId, binding: ShortcutBinding) {
    const next = { ...bindings, [id]: binding }
    setBindings(next)
    saveShortcuts(next)
  }

  return (
    <div className="space-y-1 max-w-lg">
      <p className="text-ash text-xs mb-4">
        Click a binding to record a new shortcut. Press Esc to cancel.
      </p>
      {(Object.entries(SHORTCUT_LABELS) as [ShortcutId, string][]).map(([id, label]) => {
        const conflict = findConflict(id, bindings[id], bindings)
        const conflictLabel = conflict ? SHORTCUT_LABELS[conflict] : null
        return (
          <div key={id} className="flex items-center justify-between py-2 border-b border-rim/40">
            <span className="text-chalk text-sm">{label}</span>
            <ShortcutRecorder
              binding={bindings[id]}
              onChange={(b) => handleChange(id, b)}
              conflict={conflictLabel}
            />
          </div>
        )
      })}
    </div>
  )
}

// ── Database tab ─────────────────────────────────────────────────────────────

function DbTypeBadge({ type }: { type: 'sqlite' | 'postgresql' }) {
  return type === 'sqlite' ? (
    <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-sky-900/50 text-sky-300">
      SQLite
    </span>
  ) : (
    <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-violet-900/50 text-violet-300">
      PostgreSQL
    </span>
  )
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function StatPill({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col items-center px-5 py-3 bg-raised rounded-lg border border-rim min-w-[80px]">
      <span className="text-lg font-bold text-chalk tabular-nums">{value}</span>
      <span className="text-[10px] text-ash uppercase tracking-wide mt-0.5">{label}</span>
    </div>
  )
}

function DatabaseSettings_() {
  const [db, setDb] = useState<DatabaseSettings | null>(null)
  const [stats, setStats] = useState<DbStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const [encryptModalOpen, setEncryptModalOpen] = useState(false)
  const [encrypting, setEncrypting] = useState(false)
  const [encryptError, setEncryptError] = useState<string | null>(null)

  const [wipeOpen, setWipeOpen] = useState(false)
  const [wiping, setWiping] = useState(false)
  const [wipeError, setWipeError] = useState<string | null>(null)
  const [wipeDone, setWipeDone] = useState(false)

  const [importOpen, setImportOpen] = useState(false)

  function loadData() {
    setLoading(true)
    setError(null)
    Promise.all([api.settings.database(), api.settings.stats()])
      .then(([dbRes, statsRes]) => {
        setDb(dbRes)
        setStats(statsRes)
      })
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : 'Failed to load settings.'),
      )
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadData() }, [])

  async function handleExport() {
    setExporting(true)
    setExportError(null)
    try {
      const data = await api.settings.export()
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `corebooks-export-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e: unknown) {
      setExportError(e instanceof Error ? e.message : 'Export failed.')
    } finally {
      setExporting(false)
    }
  }

  async function handleEncryptedExport(passphrase: string) {
    setEncrypting(true)
    setEncryptError(null)
    try {
      const data = await api.settings.export()
      const envelope = await encryptExport(data, passphrase)
      const blob = new Blob([JSON.stringify(envelope)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `corebooks-export-${new Date().toISOString().slice(0, 10)}.enc.json`
      a.click()
      URL.revokeObjectURL(url)
      setEncryptModalOpen(false)
    } catch (e: unknown) {
      setEncryptError(e instanceof Error ? e.message : 'Encrypted export failed.')
    } finally {
      setEncrypting(false)
    }
  }

  async function handleWipe() {
    setWiping(true)
    setWipeError(null)
    try {
      await api.settings.wipe()
      // Clear onboarding gate so the setup wizard re-runs on next load.
      localStorage.removeItem('cb_welcomed')
      setWipeDone(true)
      setWipeOpen(false)
      setStats({ accounts: 0, postedEntries: 0, draftEntries: 0, fileSizeBytes: stats?.fileSizeBytes ?? null })
    } catch (e: unknown) {
      setWipeError(e instanceof Error ? e.message : 'Wipe failed.')
    } finally {
      setWiping(false)
    }
  }

  if (loading) return <p className="text-sm text-ash">Loading…</p>

  if (error) {
    return (
      <div className="text-sm text-red-300 bg-red-950/50 border border-red-800 px-4 py-3 rounded-md">
        {error}
      </div>
    )
  }

  if (!db) return null

  return (
    <div className="space-y-5">

      {/* DB type + path */}
      <div className="bg-surface border border-rim rounded-lg divide-y divide-rim">
        <div className="flex items-center justify-between px-5 py-4">
          <span className="text-sm font-medium text-ash">Database type</span>
          <DbTypeBadge type={db.type} />
        </div>
        {db.type === 'sqlite' && db.path && (
          <div className="flex items-start justify-between px-5 py-4 gap-4">
            <span className="text-sm font-medium text-ash shrink-0">File location</span>
            <span className="font-mono text-xs text-chalk text-right break-all">{db.path}</span>
          </div>
        )}
        {db.type === 'postgresql' && (
          <div className="px-5 py-4">
            <p className="text-sm text-ash">
              Connected to PostgreSQL. Connection string is set via the{' '}
              <code className="text-chalk bg-raised px-1 py-0.5 rounded text-xs">DATABASE_URL</code>{' '}
              environment variable.
            </p>
          </div>
        )}
      </div>

      {/* Stats */}
      {stats && (
        <div>
          <h3 className="text-sm font-semibold text-chalk mb-3">What&apos;s stored</h3>
          <div className="flex flex-wrap gap-3">
            <StatPill label="Accounts" value={stats.accounts} />
            <StatPill label="Posted entries" value={stats.postedEntries} />
            <StatPill label="Drafts" value={stats.draftEntries} />
            {stats.fileSizeBytes !== null && (
              <StatPill label="File size" value={formatBytes(stats.fileSizeBytes)} />
            )}
          </div>
        </div>
      )}

      {/* Export + Import + Wipe */}
      <div>
        <h3 className="text-sm font-semibold text-chalk mb-1">Your data</h3>
        <p className="text-sm text-ash mb-3 leading-relaxed">
          Export a full backup of your accounts and entries as a JSON file. Import data from
          corebooks backups, QuickBooks (IIF), or any standard CSV. Use the wipe option
          to start fresh — for example, when switching to a new business or fiscal year.
        </p>
        {wipeDone && (
          <div className="text-sm text-emerald-300 bg-emerald-950/50 border border-emerald-800 px-4 py-3 rounded-md mb-3">
            All data has been wiped. corebooks is ready for a fresh start.
          </div>
        )}
        {exportError && (
          <div className="text-sm text-red-300 bg-red-950/50 border border-red-800 px-4 py-3 rounded-md mb-3">
            {exportError}
          </div>
        )}
        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleExport}
            disabled={exporting}
            className="px-4 py-2 text-sm font-medium rounded-md border border-neon/40 text-neon hover:bg-neon/10 disabled:opacity-50 transition-colors"
          >
            {exporting ? 'Exporting…' : 'Export Data'}
          </button>
          <button
            onClick={() => { setEncryptModalOpen(true); setEncryptError(null) }}
            disabled={encrypting}
            className="px-4 py-2 text-sm font-medium rounded-md border border-violet/40 text-violet hover:bg-violet/10 disabled:opacity-50 transition-colors"
          >
            Encrypted Export
          </button>
          <button
            onClick={() => setImportOpen(true)}
            className="px-4 py-2 text-sm font-medium rounded-md border border-neon/40 text-neon hover:bg-neon/10 transition-colors"
          >
            Import Data
          </button>
          <button
            onClick={() => { setWipeOpen(true); setWipeError(null) }}
            disabled={wipeDone}
            className="px-4 py-2 text-sm font-medium rounded-md border border-red-800/60 text-red-400 hover:bg-red-950/50 disabled:opacity-40 transition-colors"
          >
            Wipe All Data
          </button>
        </div>
      </div>

      {/* PostgreSQL multi-user guide (SQLite only) */}
      {db.type === 'sqlite' && (
        <div className="bg-surface border border-rim rounded-lg p-5 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-chalk mb-1">You&apos;re running locally</h3>
            <p className="text-sm text-ash leading-relaxed">
              Your data is stored in a single file on this computer. This works great for
              individuals and small teams sharing one machine. No configuration needed.
            </p>
          </div>
          <div className="border-t border-rim pt-4">
            <h3 className="text-sm font-semibold text-chalk mb-2">
              Need multiple people on different computers?
            </h3>
            <p className="text-sm text-ash leading-relaxed mb-3">
              Switch to PostgreSQL so your whole team can access the same books simultaneously.
              PostgreSQL is free, open-source, and runs on your own server.
            </p>
            <ol className="space-y-2 text-sm text-ash">
              <li className="flex gap-2">
                <span className="text-neon font-semibold shrink-0">1.</span>
                Install PostgreSQL on your server at{' '}
                <a href="https://postgresql.org" target="_blank" rel="noreferrer" className="text-neon hover:underline">
                  postgresql.org
                </a>
              </li>
              <li className="flex gap-2">
                <span className="text-neon font-semibold shrink-0">2.</span>
                Create a database and note the connection string:{' '}
                <code className="text-chalk bg-raised px-1 py-0.5 rounded text-xs whitespace-nowrap">
                  postgresql://user:password@your-server:5432/corebooks
                </code>
              </li>
              <li className="flex gap-2">
                <span className="text-neon font-semibold shrink-0">3.</span>
                Set{' '}
                <code className="text-chalk bg-raised px-1 py-0.5 rounded text-xs">
                  DATABASE_URL=&lt;your connection string&gt;
                </code>{' '}
                in the{' '}
                <code className="text-chalk bg-raised px-1 py-0.5 rounded text-xs">.env</code>{' '}
                file in the corebooks folder.
              </li>
              <li className="flex gap-2">
                <span className="text-neon font-semibold shrink-0">4.</span>
                Update the database provider in{' '}
                <code className="text-chalk bg-raised px-1 py-0.5 rounded text-xs">prisma/schema.prisma</code>{' '}
                from{' '}
                <code className="text-chalk bg-raised px-1 py-0.5 rounded text-xs">sqlite</code>{' '}
                to{' '}
                <code className="text-chalk bg-raised px-1 py-0.5 rounded text-xs">postgresql</code>.
              </li>
              <li className="flex gap-2">
                <span className="text-neon font-semibold shrink-0">5.</span>
                Run{' '}
                <code className="text-chalk bg-raised px-1 py-0.5 rounded text-xs">npx prisma migrate deploy</code>{' '}
                to create the tables, then restart corebooks.
              </li>
            </ol>
            <p className="text-xs text-ash mt-3">
              See{' '}
              <code className="text-chalk bg-raised px-1 py-0.5 rounded">.env.example</code> in the
              corebooks folder for a full list of configuration options.
            </p>
          </div>
        </div>
      )}

      {db.type === 'postgresql' && (
        <div className="space-y-3">
          <div className="bg-emerald-950/50 border border-emerald-800 rounded-lg px-5 py-4">
            <p className="text-sm text-emerald-300 font-medium">Multi-user setup active</p>
            <p className="text-sm text-ash mt-1">
              corebooks is connected to a shared PostgreSQL database. All users on your network can
              access the same data simultaneously.
            </p>
          </div>
          {!db.sslEnabled && (
            <div className="bg-amber-950/50 border border-amber-700 rounded-lg px-5 py-4 flex gap-3">
              <span className="text-amber-400 shrink-0 mt-0.5">⚠</span>
              <div>
                <p className="text-sm text-amber-300 font-medium">Connection is not encrypted</p>
                <p className="text-sm text-ash mt-1 leading-relaxed">
                  Your PostgreSQL connection does not use SSL. Financial data could be read by
                  anyone on the same network. Add{' '}
                  <code className="text-chalk bg-raised px-1 py-0.5 rounded text-xs">
                    ?sslmode=require
                  </code>{' '}
                  to your <code className="text-chalk bg-raised px-1 py-0.5 rounded text-xs">DATABASE_URL</code> and restart corebooks.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Import modal */}
      {importOpen && (
        <ImportModal
          onClose={() => setImportOpen(false)}
          onImported={() => { setImportOpen(false); loadData() }}
        />
      )}

      {/* Encrypted export modal */}
      {encryptModalOpen && (
        <ExportPasswordModal
          onEncrypt={handleEncryptedExport}
          onCancel={() => setEncryptModalOpen(false)}
          error={encryptError}
          loading={encrypting}
        />
      )}

      {/* Wipe confirmation modal */}
      {wipeOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-surface border border-rim rounded-xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <div>
              <h2 className="text-base font-semibold text-chalk">Wipe all data?</h2>
              <p className="text-sm text-ash mt-2 leading-relaxed">
                This will permanently delete every account and every journal entry in corebooks.
                This cannot be undone. Export a backup first if you want to keep a copy.
              </p>
            </div>
            {wipeError && (
              <div className="text-sm text-red-300 bg-red-950/50 border border-red-800 px-3 py-2 rounded-md">
                {wipeError}
              </div>
            )}
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setWipeOpen(false)}
                disabled={wiping}
                className="text-sm text-ash hover:text-chalk px-4 py-2 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleWipe}
                disabled={wiping}
                className="bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-md transition-colors"
              >
                {wiping ? 'Wiping…' : 'Yes, wipe everything'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>('home')

  const tabClass = (t: Tab) =>
    `px-4 py-2 text-sm font-medium rounded-md transition-colors ${
      tab === t
        ? 'bg-raised text-chalk'
        : 'text-ash hover:text-chalk hover:bg-surface'
    }`

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-chalk">settings</h1>
        <p className="text-sm text-ash mt-1">Application configuration.</p>
      </div>

      <div className="flex gap-1 mb-6 bg-void border border-rim rounded-lg p-1 w-fit">
        <button className={tabClass('home')} onClick={() => setTab('home')}>
          home page
        </button>
        <button className={tabClass('accounts')} onClick={() => setTab('accounts')}>
          accounts
        </button>
        <button className={tabClass('payment-methods')} onClick={() => setTab('payment-methods')}>
          payment methods
        </button>
        <button className={tabClass('accounting')} onClick={() => setTab('accounting')}>
          accounting
        </button>
        <button className={tabClass('shortcuts')} onClick={() => setTab('shortcuts')}>
          shortcuts
        </button>
        <button className={tabClass('database')} onClick={() => setTab('database')}>
          database
        </button>
      </div>

      {tab === 'home' && <HomePageSettings />}
      {tab === 'accounts' && <AccountsSettings />}
      {tab === 'payment-methods' && <PaymentMethodsSettings />}
      {tab === 'accounting' && <AccountingSettings />}
      {tab === 'shortcuts' && <ShortcutsSettings />}
      {tab === 'database' && <DatabaseSettings_ />}
    </div>
  )
}
