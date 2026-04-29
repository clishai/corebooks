import { useState, useEffect } from 'react'
import { api, DatabaseSettings } from '../api/client'
import { ALL_METRICS, MetricId, getSelectedMetrics, saveSelectedMetrics } from '../lib/metrics'

type Tab = 'home' | 'database'

// ── Home page tab ────────────────────────────────────────────────────────────

function HomePageSettings() {
  const [selected, setSelected] = useState<MetricId[]>(getSelectedMetrics)

  function toggle(id: MetricId) {
    const next = selected.includes(id) ? selected.filter((m) => m !== id) : [...selected, id]
    setSelected(next)
    saveSelectedMetrics(next)
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-ash leading-relaxed">
        Choose which metrics appear on your home page. Selected metrics show as cards that update
        each time you open the app.
      </p>

      <div className="bg-surface border border-rim rounded-lg divide-y divide-rim">
        {ALL_METRICS.map((m) => {
          const checked = selected.includes(m.id)
          return (
            <label
              key={m.id}
              className="flex items-center gap-4 px-5 py-3.5 cursor-pointer hover:bg-raised transition-colors"
            >
              <div
                className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                  checked
                    ? 'bg-neon border-neon'
                    : 'border-rim bg-base'
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

function DatabaseSettings_() {
  const [db, setDb] = useState<DatabaseSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.settings
      .database()
      .then(setDb)
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : 'Failed to load settings.'),
      )
      .finally(() => setLoading(false))
  }, [])

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
    <div className="space-y-4">
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

      {db.type === 'sqlite' && (
        <div className="bg-surface border border-rim rounded-lg p-5 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-chalk mb-1">You&apos;re running locally</h3>
            <p className="text-sm text-ash leading-relaxed">
              Your data is stored in a single file on this computer. This is the default setup —
              it works great for individuals and small teams sharing one machine. No configuration
              needed.
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
                <a
                  href="https://postgresql.org"
                  target="_blank"
                  rel="noreferrer"
                  className="text-neon hover:underline"
                >
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
                <code className="text-chalk bg-raised px-1 py-0.5 rounded text-xs">
                  prisma/schema.prisma
                </code>{' '}
                from{' '}
                <code className="text-chalk bg-raised px-1 py-0.5 rounded text-xs">sqlite</code>{' '}
                to{' '}
                <code className="text-chalk bg-raised px-1 py-0.5 rounded text-xs">
                  postgresql
                </code>
                .
              </li>
              <li className="flex gap-2">
                <span className="text-neon font-semibold shrink-0">5.</span>
                Run{' '}
                <code className="text-chalk bg-raised px-1 py-0.5 rounded text-xs">
                  npx prisma migrate deploy
                </code>{' '}
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
          <p className="text-sm text-emerald-300 font-medium">✓ Multi-user setup active</p>
          <p className="text-sm text-ash mt-1">
            corebooks is connected to a shared PostgreSQL database. All users on your network can
            access the same data simultaneously.
          </p>
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
