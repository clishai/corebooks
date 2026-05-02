import { useState, useRef, useLayoutEffect } from 'react'
import { Outlet, NavLink, useLocation } from 'react-router-dom'
import NewEntryModal from './NewEntryModal'
import Toast from './Toast'
import FirstLaunchModal, { shouldShowFirstLaunch, getCompanyName } from './FirstLaunchModal'
import logoSrc from '../assets/logo.png'

function CogIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
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

// Ordered list of routes — used to determine swipe direction on navigation.
const ROUTE_ORDER = [
  '/home',
  '/accounts',
  '/entries',
  '/drafts',
  '/reports/trial-balance',
  '/reports/balance-sheet',
  '/reports/income-statement',
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
  const [showWelcome, setShowWelcome] = useState(shouldShowFirstLaunch)
  const [companyName, setCompanyName] = useState(getCompanyName)

  const location = useLocation()
  const prevRouteIndex = useRef(-1)
  const currRouteIndex = getRouteIndex(location.pathname)

  // Compute slide direction from the previous route index (ref not yet updated this render).
  let slideClass = ''
  if (prevRouteIndex.current !== -1 && currRouteIndex !== -1 && prevRouteIndex.current !== currRouteIndex) {
    slideClass = currRouteIndex > prevRouteIndex.current ? 'page-slide-right' : 'page-slide-left'
  }

  // Update the ref after every render so the next navigation has a correct baseline.
  useLayoutEffect(() => {
    prevRouteIndex.current = currRouteIndex
  })

  function handlePosted() {
    setShowNewEntry(false)
  }

  function handleWelcomeDismiss() {
    setShowWelcome(false)
    setCompanyName(getCompanyName())
  }

  return (
    <div className="flex h-screen bg-base overflow-hidden">
      {/* Sidebar */}
      <aside className="w-52 bg-void flex flex-col shrink-0 border-r border-rim">
        {/* Logo */}
        <div className="px-4 py-3 border-b border-rim">
          <img src={logoSrc} alt="corebooks" className="w-full" />
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 px-2 space-y-0.5 overflow-y-auto">
          <NavLink to="/home" className={navLinkClass}>
            Home
          </NavLink>
          <NavLink to="/accounts" className={navLinkClass}>
            Chart of Accounts
          </NavLink>
          <NavLink to="/entries" className={navLinkClass}>
            Journal Entries
          </NavLink>
          <NavLink to="/drafts" className={navLinkClass}>
            Drafts
          </NavLink>

          <div className="pt-4 pb-1 px-3">
            <span className="text-[10px] font-semibold text-ash uppercase tracking-widest">
              Reports
            </span>
          </div>

          <NavLink to="/reports/trial-balance" className={navLinkClass}>
            Trial Balance
          </NavLink>
          <NavLink to="/reports/balance-sheet" className={navLinkClass}>
            Balance Sheet
          </NavLink>
          <NavLink to="/reports/income-statement" className={navLinkClass}>
            Income Statement
          </NavLink>
        </nav>

        {/* Settings cog — bottom of sidebar */}
        <div className="border-t border-rim px-2 py-3">
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-3 py-2 rounded text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-raised text-neon border-l-2 border-neon pl-[10px]'
                  : 'text-ash hover:bg-surface hover:text-chalk'
              }`
            }
          >
            <CogIcon />
            <span>Settings</span>
          </NavLink>
        </div>
      </aside>

      {/* Right column: toolbar + page content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top toolbar — always visible */}
        <header className="h-14 bg-void border-b border-rim flex items-center justify-between px-6 shrink-0">
          <span className="text-sm text-ash font-bold tracking-wide">
            {companyName}
          </span>
          <button
            onClick={() => setShowNewEntry(true)}
            className="bg-neon hover:bg-neon-dim active:bg-neon-dim text-void text-sm font-bold px-4 py-2 rounded-md transition-colors"
          >
            + New Entry
          </button>
        </header>

        {/* Page content — key forces remount on navigation so the slide animation reruns */}
        <main key={location.key} className={`flex-1 overflow-auto p-6 ${slideClass}`}>
          <Outlet />
        </main>
      </div>

      {showNewEntry && (
        <NewEntryModal
          onClose={() => setShowNewEntry(false)}
          onPosted={handlePosted}
          onAutoSaved={() => setToastMessage('Draft saved.')}
        />
      )}

      {toastMessage && (
        <Toast message={toastMessage} onDismiss={() => setToastMessage(null)} />
      )}

      {showWelcome && (
        <FirstLaunchModal onDismiss={handleWelcomeDismiss} />
      )}
    </div>
  )
}
