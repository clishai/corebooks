// src/ui/components/Layout.tsx
import { useState, useRef, useLayoutEffect, useEffect } from 'react'
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom'
import NewEntryModal from './NewEntryModal'
import Toast from './Toast'
import OnboardingWizard, { shouldShowOnboarding, getCompanyName } from './OnboardingWizard'
import SidebarSection from './SidebarSection'
import logoSrc from '../assets/logo.png'
import { getPinnedReports } from '../lib/sidebarState'
import { ALL_REPORTS } from '../lib/reports'

function CogIcon() {
  return (
    <svg
      className="cog-icon"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

const ROUTE_ORDER = [
  '/home',
  '/accounts',
  '/entries',
  '/drafts',
  '/reports/trial-balance',
  '/reports/balance-sheet',
  '/reports/income-statement',
  '/reports/library',
  '/extra/recurring',
  '/extra/close-period',
  '/settings',
]

function getRouteIndex(pathname: string): number {
  return ROUTE_ORDER.findIndex((r) => pathname.startsWith(r))
}

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center px-3 py-2 rounded text-sm font-medium transition-colors ${
    isActive
      ? 'bg-raised text-neon border-l-2 border-neon pl-[10px]'
      : 'text-ash hover:bg-surface hover:text-chalk'
  }`

export default function Layout() {
  const [showNewEntry, setShowNewEntry] = useState(false)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [showWelcome, setShowWelcome] = useState(shouldShowOnboarding)
  const [companyName, setCompanyName] = useState(getCompanyName)
  const [pinnedReports, setPinnedReports] = useState(getPinnedReports)

  const navigate = useNavigate()
  const location = useLocation()
  const prevRouteIndex = useRef(-1)
  const currRouteIndex = getRouteIndex(location.pathname)

  let slideClass = ''
  if (prevRouteIndex.current !== -1 && currRouteIndex !== -1 && prevRouteIndex.current !== currRouteIndex) {
    slideClass = currRouteIndex > prevRouteIndex.current ? 'page-slide-right' : 'page-slide-left'
  }

  useLayoutEffect(() => {
    prevRouteIndex.current = currRouteIndex
  })

  useEffect(() => {
    function handleNameChange() { setCompanyName(getCompanyName()) }
    function handlePinsChange() { setPinnedReports(getPinnedReports()) }
    window.addEventListener('cb:company-name-changed', handleNameChange)
    window.addEventListener('cb:pinned-reports-changed', handlePinsChange)
    return () => {
      window.removeEventListener('cb:company-name-changed', handleNameChange)
      window.removeEventListener('cb:pinned-reports-changed', handlePinsChange)
    }
  }, [])

  function handlePosted() { setShowNewEntry(false) }
  function handleWelcomeDismiss() {
    setShowWelcome(false)
    setCompanyName(getCompanyName())
  }

  const pinnedReportMetas = ALL_REPORTS.filter((r) => pinnedReports.includes(r.id))

  return (
    <div className="flex h-screen bg-base overflow-hidden">
      {/* Sidebar */}
      <aside className="w-52 bg-void flex flex-col shrink-0 border-r border-rim">
        {/* Logo — clicking navigates home */}
        <button
          onClick={() => navigate('/home')}
          className="px-4 py-3 border-b border-rim w-full text-left hover:opacity-80 transition-opacity"
        >
          <img src={logoSrc} alt="corebooks" className="w-full" />
        </button>

        {/* Nav */}
        <nav className="flex-1 py-4 px-2 overflow-y-auto space-y-1">
          {/* Home — standalone */}
          <NavLink to="/home" className={navLinkClass}>
            Home
          </NavLink>

          {/* LEDGER section */}
          <SidebarSection id="ledger" label="Ledger">
            <NavLink to="/accounts" className={navLinkClass}>Chart of Accounts</NavLink>
            <NavLink to="/entries" className={navLinkClass}>Entries</NavLink>
            <NavLink to="/drafts" className={navLinkClass}>Drafts</NavLink>
          </SidebarSection>

          {/* REPORTS section — only pinned */}
          <SidebarSection id="reports" label="Reports">
            {pinnedReportMetas.map((r) => (
              <NavLink key={r.id} to={r.path} className={navLinkClass}>
                {r.label}
              </NavLink>
            ))}
            <NavLink
              to="/reports/library"
              className="flex items-center px-3 py-2 rounded text-xs text-ash hover:text-chalk hover:bg-surface transition-colors"
            >
              Browse all reports...
            </NavLink>
          </SidebarSection>

          {/* EXTRA WORKFLOWS section */}
          <SidebarSection id="extra-workflows" label="Extra Workflows">
            <NavLink to="/extra/recurring" className={navLinkClass}>Recurring</NavLink>
            <NavLink to="/extra/close-period" className={navLinkClass}>Close Period</NavLink>
          </SidebarSection>
        </nav>

        {/* Settings cog — bottom */}
        <div className="border-t border-rim px-2 py-3">
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              `settings-link flex items-center gap-0 px-3 py-2 rounded text-sm font-medium transition-colors overflow-hidden ${
                isActive
                  ? 'bg-raised text-neon border-l-2 border-neon pl-[10px]'
                  : 'text-ash hover:bg-surface hover:text-chalk'
              }`
            }
          >
            <CogIcon />
            <span className="settings-label ml-2.5">Settings</span>
          </NavLink>
        </div>
      </aside>

      {/* Right column */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top toolbar */}
        <header className="h-12 border-b border-rim bg-void flex items-center px-4 gap-3 shrink-0">
          <button
            onClick={() => navigate('/home')}
            className="text-sm font-medium text-chalk hover:text-neon transition-colors truncate max-w-[180px]"
          >
            {companyName || 'corebooks'}
          </button>

          {/* Ghost search bar — shell only, functionality added in Phase 8 */}
          <div className="flex-1 max-w-xs">
            <input
              readOnly
              placeholder="search..."
              className="w-full bg-surface border border-rim rounded-sm px-3 py-1 text-xs text-ash placeholder-ash/50 cursor-pointer focus:outline-none"
            />
          </div>

          <div className="ml-auto">
            <button
              onClick={() => setShowNewEntry(true)}
              className="bg-neon hover:bg-neon-dim text-void text-xs font-semibold px-3 py-1.5 rounded-sm transition-colors"
            >
              + New Entry
            </button>
          </div>
        </header>

        {/* Page content */}
        <main key={location.key} className={`flex-1 overflow-auto ${slideClass}`}>
          <Outlet />
        </main>
      </div>

      {showNewEntry && (
        <NewEntryModal
          onClose={() => {
            setShowNewEntry(false)
            setToastMessage('Draft saved')
          }}
          onPosted={handlePosted}
          onAutoSaved={() => setToastMessage('Draft saved')}
        />
      )}
      {toastMessage && (
        <Toast message={toastMessage} onDismiss={() => setToastMessage(null)} />
      )}
      {showWelcome && <OnboardingWizard onDismiss={handleWelcomeDismiss} />}
    </div>
  )
}
