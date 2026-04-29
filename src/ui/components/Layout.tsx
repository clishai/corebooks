import { useState } from 'react'
import { Outlet, NavLink } from 'react-router-dom'
import NewEntryModal from './NewEntryModal'
import Toast from './Toast'
import FirstLaunchModal, { shouldShowFirstLaunch } from './FirstLaunchModal'

function PangolinIcon() {
  return (
    <svg width="32" height="26" viewBox="0 0 44 38" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Body */}
      <ellipse cx="25" cy="21" rx="13" ry="9" stroke="currentColor" strokeWidth="1.5" fill="currentColor" fillOpacity="0.1"/>
      {/* Scale arcs across body */}
      <path d="M15 14 Q25 8 35 14" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      <path d="M14 18 Q25 12 36 18" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      <path d="M15 22 Q25 17 35 22" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      {/* Head */}
      <circle cx="9" cy="20" r="6" stroke="currentColor" strokeWidth="1.5" fill="currentColor" fillOpacity="0.1"/>
      {/* Snout */}
      <path d="M4 20 L1 21.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      {/* Eye */}
      <circle cx="7.5" cy="18.5" r="1.3" fill="currentColor"/>
      {/* Tail */}
      <path d="M38 21 Q43 19 42 26 Q41 31 36 28" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      {/* Legs */}
      <line x1="19" y1="29" x2="19" y2="34" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="26" y1="30" x2="26" y2="35" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="31" y1="29" x2="31" y2="34" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
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

  function handlePosted() {
    setShowNewEntry(false)
  }

  return (
    <div className="flex h-screen bg-base overflow-hidden">
      {/* Sidebar */}
      <aside className="w-52 bg-void flex flex-col shrink-0 border-r border-rim">
        {/* Logo */}
        <div className="px-4 py-4 border-b border-rim flex items-center gap-2.5">
          <span className="text-neon">
            <PangolinIcon />
          </span>
          <span className="font-bold text-base text-chalk lowercase tracking-tight">corebooks</span>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 px-2 space-y-0.5 overflow-y-auto">
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

          <div className="pt-4 pb-1 px-3">
            <span className="text-[10px] font-semibold text-ash uppercase tracking-widest">
              Settings
            </span>
          </div>

          <NavLink to="/settings/database" className={navLinkClass}>
            Database
          </NavLink>
        </nav>
      </aside>

      {/* Right column: toolbar + page content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top toolbar — always visible */}
        <header className="h-14 bg-void border-b border-rim flex items-center justify-between px-6 shrink-0">
          <span className="text-sm text-ash font-bold tracking-wide lowercase">
            corebooks
          </span>
          <button
            onClick={() => setShowNewEntry(true)}
            className="bg-neon hover:bg-neon-dim active:bg-neon-dim text-void text-sm font-bold px-4 py-2 rounded-md transition-colors"
          >
            + New Entry
          </button>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto p-6">
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
        <FirstLaunchModal onDismiss={() => setShowWelcome(false)} />
      )}
    </div>
  )
}
