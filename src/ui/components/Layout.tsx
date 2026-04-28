import { useState } from 'react'
import { Outlet, NavLink } from 'react-router-dom'
import NewEntryModal from './NewEntryModal'

export default function Layout() {
  const [showNewEntry, setShowNewEntry] = useState(false)

  function handlePosted() {
    setShowNewEntry(false)
    // Pages re-fetch on mount; a posted entry will appear next time the
    // user visits the Journal Entries page.
  }

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* Sidebar */}
      <aside className="w-52 bg-slate-800 text-white flex flex-col shrink-0">
        <div className="px-5 py-4 border-b border-slate-700">
          <span className="font-semibold text-base tracking-tight">CoreBooks</span>
        </div>
        <nav className="flex-1 py-3 space-y-0.5 px-2">
          <NavLink
            to="/accounts"
            className={({ isActive }) =>
              `flex items-center px-3 py-2 rounded text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-slate-700 text-white'
                  : 'text-slate-300 hover:bg-slate-700 hover:text-white'
              }`
            }
          >
            Chart of Accounts
          </NavLink>
          <NavLink
            to="/entries"
            className={({ isActive }) =>
              `flex items-center px-3 py-2 rounded text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-slate-700 text-white'
                  : 'text-slate-300 hover:bg-slate-700 hover:text-white'
              }`
            }
          >
            Journal Entries
          </NavLink>
        </nav>
      </aside>

      {/* Right column: toolbar + page content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top toolbar — always visible */}
        <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0">
          <span className="text-sm text-slate-400 font-medium tracking-wide">CoreBooks</span>
          <button
            onClick={() => setShowNewEntry(true)}
            className="bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-sm font-semibold px-4 py-2 rounded-md transition-colors"
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
        />
      )}
    </div>
  )
}
