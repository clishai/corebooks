import { useNavigate } from 'react-router-dom'
import { ALL_REPORTS } from '../lib/reports'
import { isReportPinned, togglePinnedReport } from '../lib/sidebarState'
import { useState } from 'react'

export default function ReportsLibraryPage() {
  const navigate = useNavigate()
  const [pinned, setPinned] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(ALL_REPORTS.map((report) => [report.id, isReportPinned(report.id)])),
  )

  function handleTogglePin(id: string): void {
    togglePinnedReport(id)
    setPinned((current) => ({ ...current, [id]: !current[id] }))
    window.dispatchEvent(new Event('cb:pinned-reports-changed'))
  }

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-chalk">Reports Library</h1>
        <p className="text-sm text-ash mt-1">
          All reports are available here. Star a report to pin it to the sidebar.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {ALL_REPORTS.map((report) => (
          <div
            key={report.id}
            className="bg-surface border border-rim rounded-sm px-5 py-4 hover:border-neon/40 transition-colors"
          >
            <div className="flex items-start justify-between gap-4">
              <button
                onClick={() => navigate(report.path)}
                className="text-left cursor-pointer group"
              >
                <span className="block text-sm font-semibold text-chalk group-hover:text-neon transition-colors">
                  {report.label}
                </span>
                <span className="block text-xs text-ash mt-1 leading-relaxed">
                  {report.description}
                </span>
              </button>

              <button
                onClick={() => handleTogglePin(report.id)}
                className="text-2xl leading-none cursor-pointer"
                title={pinned[report.id] ? 'Unpin from sidebar' : 'Pin to sidebar'}
              >
                <span className={pinned[report.id] ? 'text-neon star-zap' : 'text-ash hover:text-chalk'}>
                  ★
                </span>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
