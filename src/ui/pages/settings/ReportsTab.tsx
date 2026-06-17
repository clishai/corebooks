import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ALL_REPORTS } from '../../lib/reports'
import { isReportPinned, togglePinnedReport } from '../../lib/sidebarState'

export default function ReportsTab() {
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
    <div className="space-y-4">
      <div className="bg-surface border border-rim rounded-sm px-5 py-4">
        <h3 className="text-sm font-semibold text-chalk">Report visibility</h3>
        <p className="text-sm text-ash mt-1 leading-relaxed">
          All reports are available from <button onClick={() => navigate('/reports')} className="text-neon hover:underline cursor-pointer">Reports Library</button>.
          Starred reports are also pinned directly under Reports in the sidebar.
        </p>
      </div>
      {ALL_REPORTS.map((report) => (
        <div
          key={report.id}
          className="flex items-center justify-between bg-surface border border-rim rounded-sm px-4 py-3"
        >
          <div>
            <button
              onClick={() => navigate(report.path)}
              className="text-chalk font-medium text-sm hover:text-neon transition-colors text-left cursor-pointer"
            >
              {report.label}
            </button>
            <p className="text-ash text-xs mt-0.5">{report.description}</p>
          </div>
          <button
            onClick={() => handleTogglePin(report.id)}
            className="ml-4 leading-none focus:outline-none cursor-pointer"
            title={pinned[report.id] ? 'Unpin from sidebar' : 'Pin to sidebar'}
          >
            <span className={`text-5xl transition-colors ${pinned[report.id] ? 'text-neon star-zap' : 'text-ash'}`}>
              ★
            </span>
          </button>
        </div>
      ))}
    </div>
  )
}
