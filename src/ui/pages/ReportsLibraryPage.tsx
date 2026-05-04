// src/ui/pages/ReportsLibraryPage.tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ALL_REPORTS } from '../lib/reports'
import { isReportPinned, togglePinnedReport } from '../lib/sidebarState'

export default function ReportsLibraryPage() {
  const navigate = useNavigate()
  const [pinned, setPinned] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(ALL_REPORTS.map((r) => [r.id, isReportPinned(r.id)]))
  )

  function handleTogglePin(id: string) {
    togglePinnedReport(id)
    setPinned((prev) => ({ ...prev, [id]: !prev[id] }))
    window.dispatchEvent(new Event('cb:pinned-reports-changed'))
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-chalk font-semibold text-lg mb-1">Reports Library</h1>
      <p className="text-ash text-sm mb-6">
        Pin reports to your sidebar for quick access. Pinned reports appear under the Reports section.
      </p>
      <div className="space-y-2">
        {ALL_REPORTS.map((report) => (
          <div
            key={report.id}
            className="flex items-center justify-between bg-surface border border-rim rounded-sm px-4 py-3"
          >
            <div>
              <button
                onClick={() => navigate(report.path)}
                className="text-chalk font-medium text-sm hover:text-neon transition-colors text-left"
              >
                {report.label}
              </button>
              <p className="text-ash text-xs mt-0.5">{report.description}</p>
            </div>
            <button
              onClick={() => handleTogglePin(report.id)}
              className="ml-4 text-xl leading-none focus:outline-none"
              title={pinned[report.id] ? 'Unpin from sidebar' : 'Pin to sidebar'}
            >
              <span className={`transition-colors ${pinned[report.id] ? 'text-neon star-zap' : 'text-ash'}`}>
                ★
              </span>
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
