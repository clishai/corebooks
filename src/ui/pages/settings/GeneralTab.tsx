import { useEffect, useState } from 'react'
import { ALL_METRICS, MetricId, getSelectedMetrics, saveSelectedMetrics, HomeLayout, getHomeLayout, saveHomeLayout } from '../../lib/metrics'
import { SNOOZE_OPTIONS, getSnoozeDuration, saveSnoozeDuration } from '../../lib/alerts'
import { api } from '../../api/client'

export default function GeneralTab() {
  const [companyName, setCompanyName] = useState(() => localStorage.getItem('cb_company_name') ?? '')
  const [companySaved, setCompanySaved] = useState(false)
  const [selected, setSelected] = useState<MetricId[]>(getSelectedMetrics)
  const [layout, setLayout] = useState<HomeLayout>(getHomeLayout)
  const [snooze, setSnooze] = useState<number | null>(getSnoozeDuration)

  useEffect(() => {
    api.settings.appSettings()
      .then((settings) => {
        if (typeof settings['companyName'] === 'string') {
          setCompanyName(settings['companyName'])
          localStorage.setItem('cb_company_name', settings['companyName'])
          window.dispatchEvent(new CustomEvent('cb:company-name-changed'))
        }
      })
      .catch(() => {})
  }, [])

  function handleSaveCompanyName() {
    const trimmed = companyName.trim()
    if (trimmed) {
      localStorage.setItem('cb_company_name', trimmed)
    } else {
      localStorage.removeItem('cb_company_name')
    }
    void api.settings.saveAppSettings({ companyName: trimmed || null })
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

      {/* Reminder frequency — global setting for all reminders in the app */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-chalk">Reminder frequency</h3>
        <p className="text-sm text-ash leading-relaxed">
          How long before a dismissed reminder reappears. Applies to all reminders in the app —
          home page alerts, misplaced file notifications, and any future reminders.
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
          "Never" means dismissed reminders do not reappear until you clear your browser data.
        </p>
      </div>

    </div>
  )
}
