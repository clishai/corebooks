import { useState, useEffect } from 'react'
import { api, DatabaseSettings, DbStats } from '../api/client'
import { ALL_METRICS, MetricId, getSelectedMetrics, saveSelectedMetrics, HomeLayout, getHomeLayout, saveHomeLayout } from '../lib/metrics'
import { SNOOZE_OPTIONS, getSnoozeDuration, saveSnoozeDuration } from '../lib/alerts'

type Tab = 'home' | 'database'

// ── Home page tab ────────────────────────────────────────────────────────────

function HomePageSettings() {
  const [selected, setSelected] = useState<MetricId[]>(getSelectedMetrics)
  const [layout, setLayout] = useState<HomeLayout>(getHomeLayout)
  const [snooze, setSnooze] = useState<number | null>(getSnoozeDuration)

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

  const [wipeOpen, setWipeOpen] = useState(false)
  const [wiping, setWiping] = useState(false)
  const [wipeError, setWipeError] = useState<string | null>(null)
  const [wipeDone, setWipeDone] = useState(false)

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

  async function handleWipe() {
    setWiping(true)
    setWipeError(null)
    try {
      await api.settings.wipe()
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

      {/* Export + Wipe */}
      <div>
        <h3 className="text-sm font-semibold text-chalk mb-1">Your data</h3>
        <p className="text-sm text-ash mb-3 leading-relaxed">
          Export a full backup of your accounts and entries as a JSON file. Use the wipe option
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
        <div className="flex gap-3">
          <button
            onClick={handleExport}
            disabled={exporting}
            className="px-4 py-2 text-sm font-medium rounded-md border border-neon/40 text-neon hover:bg-neon/10 disabled:opacity-50 transition-colors"
          >
            {exporting ? 'Exporting…' : 'Export Data'}
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
        <div className="bg-emerald-950/50 border border-emerald-800 rounded-lg px-5 py-4">
          <p className="text-sm text-emerald-300 font-medium">Multi-user setup active</p>
          <p className="text-sm text-ash mt-1">
            corebooks is connected to a shared PostgreSQL database. All users on your network can
            access the same data simultaneously.
          </p>
        </div>
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
        <button className={tabClass('database')} onClick={() => setTab('database')}>
          database
        </button>
      </div>

      {tab === 'home' && <HomePageSettings />}
      {tab === 'database' && <DatabaseSettings_ />}
    </div>
  )
}
