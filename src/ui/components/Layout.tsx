import { useState, useRef, useLayoutEffect, useEffect, useMemo } from 'react'
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom'
import NewEntryModal from './NewEntryModal'
import Toast from './Toast'
import ActionToast from './ActionToast'
import OnboardingWizard, { shouldShowOnboarding, getCompanyName } from './OnboardingWizard'
import CommandPalette from './CommandPalette'
import SidebarSection from './SidebarSection'
import SidebarWordmark from './SidebarWordmark'
import SidebarCollapseToggle from './SidebarCollapseToggle'
import { getPinnedReports, togglePinnedReport, expandSection } from '../lib/sidebarState'
import { getSidebarWide, setSidebarWide, getNavSectionOrder, type NavSectionId } from '../lib/sidebarLayout'
import { ALL_REPORTS } from '../lib/reports'
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts'
import { formatBinding, getShortcuts } from '../lib/shortcuts'
import ImportModal from './ImportModal'
import { isFeatureActive } from '../lib/features'

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
  '/home', '/accounts', '/entries', '/drafts',
  '/reports/trial-balance', '/reports/balance-sheet', '/reports/income-statement',
  '/reports', '/reports/general-ledger', '/reports/account-activity', '/reports/cash-flow',
  '/extra/bank-feed', '/extra/reconciliation', '/extra/recurring', '/extra/close-period', '/settings',
]

function getRouteIndex(pathname: string): number {
  return ROUTE_ORDER.findIndex((r) => pathname.startsWith(r))
}

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center px-3 py-2 rounded text-sm font-medium transition-colors cursor-pointer ${
    isActive ? 'bg-raised text-neon border-l-2 border-neon pl-[10px]' : 'text-ash border-l-2 border-transparent hover:bg-surface hover:text-chalk'
  }`

interface ActionToastState {
  id: string
  message: string
  actions: { label: string; onClick: () => void; variant?: 'primary' | 'ghost' }[]
}

export default function Layout() {
  const [showNewEntry, setShowNewEntry] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [actionToast, setActionToast] = useState<ActionToastState | null>(null)
  const [showWelcome, setShowWelcome] = useState(shouldShowOnboarding)
  const [companyName, setCompanyName] = useState(getCompanyName)
  const [pinnedReports, setPinnedReports] = useState(getPinnedReports)
  const [pendingImportCount, setPendingImportCount] = useState(0)
  const [searchShortcutLabel, setSearchShortcutLabel] = useState(
    () => formatBinding(getShortcuts()['global-search']),
  )

  const [sidebarWide, setSidebarWideState] = useState(getSidebarWide)
  const [featureVersion, setFeatureVersion] = useState(0)
  void featureVersion

  function toggleSidebar() {
    setSidebarWideState((prev) => {
      const next = !prev
      setSidebarWide(next)
      return next
    })
  }

  const [navOrder, setNavOrder] = useState(getNavSectionOrder)

  // Vault-triggered import (pre-loaded file)
  const [vaultImportFile, setVaultImportFile] = useState<{ name: string; path: string; text: string } | null>(null)

  const navigate = useNavigate()
  const location = useLocation()
  const prevRouteIndex = useRef(-1)
  const currRouteIndex = getRouteIndex(location.pathname)

  let slideClass = ''
  if (prevRouteIndex.current !== -1 && currRouteIndex !== -1 && prevRouteIndex.current !== currRouteIndex) {
    slideClass = currRouteIndex > prevRouteIndex.current ? 'page-slide-right' : 'page-slide-left'
  }

  useLayoutEffect(() => { prevRouteIndex.current = currRouteIndex })

  useEffect(() => {
    function handleShortcutsChanged() {
      setSearchShortcutLabel(formatBinding(getShortcuts()['global-search']))
    }
    window.addEventListener('cb:shortcuts-changed', handleShortcutsChanged)
    return () => window.removeEventListener('cb:shortcuts-changed', handleShortcutsChanged)
  }, [])

  // Vault file events
  useEffect(() => {
    const vault = window.electronAPI?.vault
    if (!vault) return

    vault.listImports().then((files) => setPendingImportCount(files.length)).catch(() => {})

    const unsubscribeAdded = vault.onFileAdded((event) => {
      if (event.hint === 'import') {
        vault.listImports().then((files) => {
          setPendingImportCount(files.length)
          window.dispatchEvent(new CustomEvent('cb:vault-imports-changed'))
        }).catch(() => {})
        setActionToast({
          id: event.path,
          message: `${event.name} is ready to import`,
          actions: [
            {
              label: 'Import now',
              onClick: () => void openVaultImport(event.path, event.name),
            },
          ],
        })
      } else if (event.hint === 'misplaced') {
        setActionToast({
          id: event.path,
          message: `${event.name} landed in ${event.folder || 'vault root'} — did you mean to import it?`,
          actions: [
            {
              label: 'Import',
              onClick: () => void openVaultImport(event.path, event.name),
            },
            {
              label: 'Dismiss',
              variant: 'ghost' as const,
              onClick: () => {},
            },
          ],
        })
      }
    })

    const unsubscribeRemoved = vault.onFileRemoved(() => {
      vault.listImports().then((files) => {
        setPendingImportCount(files.length)
        window.dispatchEvent(new CustomEvent('cb:vault-imports-changed'))
      }).catch(() => {})
    })

    function handleVaultOpenImport(e: Event) {
      const { path, name } = (e as CustomEvent<{ path: string; name: string }>).detail
      void openVaultImport(path, name)
    }
    window.addEventListener('cb:vault-open-import', handleVaultOpenImport)
    return () => {
      unsubscribeAdded()
      unsubscribeRemoved()
      window.removeEventListener('cb:vault-open-import', handleVaultOpenImport)
    }
  }, [])

  async function openVaultImport(filePath: string, fileName: string) {
    const vault = window.electronAPI?.vault
    if (!vault) return
    try {
      const text = await vault.readFile(filePath)
      setVaultImportFile({ name: fileName, path: filePath, text })
    } catch {
      setToastMessage('Could not read file')
    }
  }

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

  // Listen for nav order changes made in Settings
  useEffect(() => {
    function handleNavOrderChanged() { setNavOrder(getNavSectionOrder()) }
    window.addEventListener('cb:nav-order-changed', handleNavOrderChanged)
    return () => window.removeEventListener('cb:nav-order-changed', handleNavOrderChanged)
  }, [])

  useEffect(() => {
    function handleOpenNewEntry() { setShowNewEntry(true) }
    window.addEventListener('cb:open-new-entry', handleOpenNewEntry)
    return () => window.removeEventListener('cb:open-new-entry', handleOpenNewEntry)
  }, [])

  useEffect(() => {
    function handleSidebarWidthChange(e: Event) {
      setSidebarWideState((e as CustomEvent<{ wide: boolean }>).detail.wide)
    }
    window.addEventListener('cb:sidebar-wide-changed', handleSidebarWidthChange)
    return () => window.removeEventListener('cb:sidebar-wide-changed', handleSidebarWidthChange)
  }, [])

  useEffect(() => {
    function handleFeatureChange() { setFeatureVersion((v) => v + 1) }
    window.addEventListener('cb:feature-state-changed', handleFeatureChange)
    return () => window.removeEventListener('cb:feature-state-changed', handleFeatureChange)
  }, [])

  const shortcutHandlers = useMemo(() => ({
    'new-entry': () => setShowNewEntry(true),
    'go-home': () => navigate('/home'),
    'go-entries': () => navigate('/entries'),
    'go-accounts': () => navigate('/accounts'),
    'go-drafts': () => navigate('/drafts'),
    'go-recurring': () => navigate('/extra/recurring'),
    'go-close-period': () => navigate('/extra/close-period'),
    'global-search': () => setShowSearch(true),
    'pin-report': () => {
      const report = ALL_REPORTS.find((candidate) => location.pathname === candidate.path)
      if (!report) return
      togglePinnedReport(report.id)
      setPinnedReports(getPinnedReports())
      window.dispatchEvent(new Event('cb:pinned-reports-changed'))
    },
  }), [location.pathname, navigate])

  useKeyboardShortcuts(shortcutHandlers)

  function handlePosted() {
    setShowNewEntry(false)
    window.dispatchEvent(new Event('cb:entry-posted'))
  }

  const pinnedReportMetas = ALL_REPORTS.filter((r) => pinnedReports.includes(r.id))

  // On macOS with titleBarStyle:'hiddenInset', traffic lights sit at (12,12)
  // and overlay the top of the sidebar. A 28px draggable spacer pushes
  // sidebar content below the buttons and gives a native window-drag region.
  const isMacElectron = !!window.electronAPI && /Mac/.test(navigator.platform)

  return (
    <div className="flex h-screen bg-base overflow-hidden">
      {/* Sidebar */}
      <aside className={`sidebar-transition bg-void flex flex-col shrink-0 border-r border-rim overflow-hidden ${sidebarWide ? 'w-52' : 'w-[52px]'}`}>
        {/* macOS title-bar spacer — keeps traffic lights from overlapping content */}
        {isMacElectron && (
          <div
            className="h-7 shrink-0 select-none"
            style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
          />
        )}
        {/* Zone 1: Logo */}
        <SidebarWordmark wide={sidebarWide} onClick={() => navigate('/home')} />

        {/* Zone 2: Scrollable nav */}
        <nav className="flex-1 py-4 px-2 overflow-y-auto min-h-0">
          {sidebarWide ? (
            <div className="space-y-1">
              {/* Home — always first, pinned */}
              <NavLink to="/home" className={navLinkClass}>Home</NavLink>

              {/* Ordered sections — order controlled from Settings → Navigation */}
              {navOrder.map((sectionId) => {
                if (sectionId === 'ledger') return (
                  <SidebarSection key="ledger" id="ledger" label="Ledger">
                    <NavLink to="/accounts" className={navLinkClass}>Chart of Accounts</NavLink>
                    <NavLink to="/entries" className={navLinkClass}>Entries</NavLink>
                    <NavLink to="/drafts" className={navLinkClass}>Drafts</NavLink>
                  </SidebarSection>
                )
                if (sectionId === 'reports') return (
                  <SidebarSection key="reports" id="reports" label="Reports">
                    <NavLink to="/reports" end className={navLinkClass}>Reports Library</NavLink>
                    {pinnedReportMetas.map((r) => (
                      <NavLink key={r.id} to={r.path} className={navLinkClass}>{r.label}</NavLink>
                    ))}
                  </SidebarSection>
                )
                if (sectionId === 'extra-workflows') {
                  const workflowLinks = [
                    { id: 'bank-feed',      to: '/extra/bank-feed',      label: 'Bank Feed' },
                    { id: 'reconciliation', to: '/extra/reconciliation', label: 'Reconciliation' },
                    { id: 'recurring',      to: '/extra/recurring',      label: 'Recurring' },
                    { id: 'close-period',   to: '/extra/close-period',   label: 'Close Period' },
                  ].filter((w) => isFeatureActive(w.id))
                  if (workflowLinks.length === 0) return null
                  return (
                    <SidebarSection key="extra-workflows" id="extra-workflows" label="Extra Workflows">
                      {workflowLinks.map((w) => (
                        <NavLink key={w.id} to={w.to} className={navLinkClass}>{w.label}</NavLink>
                      ))}
                    </SidebarSection>
                  )
                }
                return null
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1 pt-1">
              <NavLink
                to="/home"
                title="Home"
                className={({ isActive }) =>
                  `flex items-center justify-center w-8 h-8 rounded transition-colors ${isActive ? 'text-neon bg-raised' : 'text-ash hover:text-chalk hover:bg-surface'}`
                }
              >
                <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                  <polyline points="9 22 9 12 15 12 15 22"/>
                </svg>
              </NavLink>
              <div className="w-6 border-t border-rim my-1" />
              <button
                title="Ledger"
                onClick={() => { expandSection('ledger'); toggleSidebar() }}
                className="flex items-center justify-center w-8 h-8 rounded text-ash hover:text-chalk hover:bg-surface transition-colors"
              >
                <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
                  <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
                </svg>
              </button>
              <button
                title="Reports"
                onClick={() => { expandSection('reports'); toggleSidebar() }}
                className="flex items-center justify-center w-8 h-8 rounded text-ash hover:text-chalk hover:bg-surface transition-colors"
              >
                <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
                </svg>
              </button>
              {['bank-feed', 'reconciliation', 'recurring', 'close-period'].some((id) => isFeatureActive(id)) && (
                <button
                  title="Extra Workflows"
                  onClick={() => { expandSection('extra-workflows'); toggleSidebar() }}
                  className="flex items-center justify-center w-8 h-8 rounded text-ash hover:text-chalk hover:bg-surface transition-colors"
                >
                  <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                  </svg>
                </button>
              )}
            </div>
          )}
        </nav>

        {/* Zone 3a: Pinned Settings */}
        <div className="shrink-0 border-t border-rim px-2 py-1">
          {sidebarWide ? (
            <NavLink
              to="/settings"
              className={({ isActive }) =>
                `settings-link flex items-center gap-0 px-3 py-2 rounded text-sm font-medium transition-colors overflow-hidden cursor-pointer ${
                  isActive ? 'bg-raised text-neon border-l-2 border-neon pl-[10px]' : 'text-ash border-l-2 border-transparent hover:bg-surface hover:text-chalk'
                }`
              }
            >
              <CogIcon />
              <span className="settings-label ml-2.5">Settings</span>
            </NavLink>
          ) : (
            <NavLink
              to="/settings"
              title="Settings"
              className={({ isActive }) =>
                `flex items-center justify-center w-8 h-8 rounded mx-auto transition-colors ${isActive ? 'text-neon bg-raised' : 'text-ash hover:text-chalk hover:bg-surface'}`
              }
            >
              <CogIcon />
            </NavLink>
          )}
        </div>

        {/* Zone 3b: Collapse toggle */}
        <SidebarCollapseToggle wide={sidebarWide} onToggle={toggleSidebar} />
      </aside>

      {/* Right column */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Top toolbar — draggable on macOS so users can move the window */}
        <header
          className="h-12 border-b border-rim bg-void grid grid-cols-[1fr_auto_1fr] items-center px-4 shrink-0"
          style={isMacElectron ? { WebkitAppRegion: 'drag' } as React.CSSProperties : undefined}
        >
          <div className="flex items-center min-w-0" style={isMacElectron ? { WebkitAppRegion: 'no-drag' } as React.CSSProperties : undefined}>
            <button
              onClick={() => navigate('/home')}
              className="text-sm font-medium text-chalk hover:text-neon transition-colors truncate max-w-[160px] cursor-pointer"
              title={companyName || 'corebooks'}
            >
              {companyName || 'corebooks'}
            </button>
          </div>

          <div className="w-72" style={isMacElectron ? { WebkitAppRegion: 'no-drag' } as React.CSSProperties : undefined}>
            <button
              onClick={() => setShowSearch(true)}
              className="w-full bg-surface border border-rim rounded-sm px-3 py-1 text-xs text-ash/50 text-left hover:border-neon/50 transition-colors focus:outline-none cursor-pointer"
            >
              Press {searchShortcutLabel} for global search
            </button>
          </div>

          <div className="flex items-center justify-end gap-2" style={isMacElectron ? { WebkitAppRegion: 'no-drag' } as React.CSSProperties : undefined}>
            <button
              onClick={() => setShowNewEntry(true)}
              className="bg-neon hover:bg-neon-dim text-void text-xs font-semibold px-3 py-1.5 rounded-sm transition-colors cursor-pointer"
            >
              + New Entry
            </button>
          </div>
        </header>

        {/* Content row */}
        <div className="flex-1 flex overflow-hidden">
          <main key={location.key} className={`flex-1 overflow-auto p-6 min-w-0 ${slideClass}`}>
            <Outlet context={{ pendingImportCount }} />
          </main>
        </div>
      </div>

      {showNewEntry && (
        <NewEntryModal
          onClose={() => { setShowNewEntry(false); setToastMessage('Draft saved') }}
          onPosted={handlePosted}
          onAutoSaved={() => setToastMessage('Draft saved')}
        />
      )}
      {vaultImportFile && (
        <ImportModal
          preloadFile={vaultImportFile}
          onClose={() => setVaultImportFile(null)}
          onImported={() => {
            setVaultImportFile(null)
            window.dispatchEvent(new CustomEvent('cb:vault-imports-changed'))
          }}
        />
      )}
      {toastMessage && <Toast message={toastMessage} onDismiss={() => setToastMessage(null)} />}
      {actionToast && (
        <ActionToast
          key={actionToast.id}
          message={actionToast.message}
          actions={actionToast.actions}
          onDismiss={() => setActionToast(null)}
        />
      )}
      {showWelcome && <OnboardingWizard onDismiss={() => { setShowWelcome(false); setCompanyName(getCompanyName()) }} />}
      {showSearch && <CommandPalette onClose={() => setShowSearch(false)} />}
    </div>
  )
}

