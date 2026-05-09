import { useState, useRef, useLayoutEffect, useEffect, useCallback } from 'react'
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom'
import NewEntryModal from './NewEntryModal'
import Toast from './Toast'
import ActionToast from './ActionToast'
import AIButtonPopover from './AIButtonPopover'
import AIPanel from './AIPanel'
import OnboardingWizard, { shouldShowOnboarding, getCompanyName } from './OnboardingWizard'
import CommandPalette from './CommandPalette'
import SidebarSection from './SidebarSection'
import logoSrc from '../assets/logo.png'
import { getPinnedReports } from '../lib/sidebarState'
import { ALL_REPORTS } from '../lib/reports'
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts'
import { getOllamaConfig, checkOllama, type OllamaConfig } from '../lib/ollama'

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
  '/extra/recurring', '/extra/close-period', '/settings',
]

function getRouteIndex(pathname: string): number {
  return ROUTE_ORDER.findIndex((r) => pathname.startsWith(r))
}

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center px-3 py-2 rounded text-sm font-medium transition-colors cursor-pointer ${
    isActive ? 'bg-raised text-neon border-l-2 border-neon pl-[10px]' : 'text-ash hover:bg-surface hover:text-chalk'
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

  // AI state
  const [aiConfig, setAiConfig] = useState<OllamaConfig>(getOllamaConfig)
  const [ollamaConnected, setOllamaConnected] = useState<boolean | null>(null)
  const [aiPanelOpen, setAiPanelOpen] = useState(() => localStorage.getItem('cb_ai_panel_open') === 'true')

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

  // Ollama background ping
  const pingOllama = useCallback(async () => {
    if (!aiConfig.enabled) return
    const result = await checkOllama(aiConfig.endpoint)
    setOllamaConnected(result.connected)
  }, [aiConfig.enabled, aiConfig.endpoint])

  useEffect(() => {
    if (!aiConfig.enabled) { setOllamaConnected(null); return }
    void pingOllama()
    const interval = setInterval(() => void pingOllama(), 60_000)
    return () => clearInterval(interval)
  }, [aiConfig.enabled, pingOllama])

  // Re-ping when window gains focus
  useEffect(() => {
    const handler = () => void pingOllama()
    window.addEventListener('focus', handler)
    return () => window.removeEventListener('focus', handler)
  }, [pingOllama])

  // Refresh AI config when settings change
  useEffect(() => {
    function handleAiConfigChanged() { setAiConfig(getOllamaConfig()) }
    window.addEventListener('cb:ai-config-changed', handleAiConfigChanged)
    return () => window.removeEventListener('cb:ai-config-changed', handleAiConfigChanged)
  }, [])

  // Vault file events
  useEffect(() => {
    const vault = window.electronAPI?.vault
    if (!vault) return

    vault.listImports().then((files) => setPendingImportCount(files.length)).catch(() => {})

    vault.onFileAdded((event) => {
      if (event.hint === 'import') {
        setPendingImportCount((n) => n + 1)
        window.dispatchEvent(new CustomEvent('cb:vault-imports-changed'))
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

    vault.onFileRemoved(() => {
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
    return () => window.removeEventListener('cb:vault-open-import', handleVaultOpenImport)
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

  function toggleAiPanel() {
    setAiPanelOpen((prev) => {
      const next = !prev
      localStorage.setItem('cb_ai_panel_open', String(next))
      return next
    })
  }

  async function handleOllamaActivate(): Promise<boolean> {
    const started = await window.electronAPI?.ollama.start()
    if (started) {
      const result = await checkOllama(aiConfig.endpoint)
      setOllamaConnected(result.connected)
      return result.connected
    }
    return false
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

  useKeyboardShortcuts({
    'new-entry': () => setShowNewEntry(true),
    'go-home': () => navigate('/home'),
    'go-entries': () => navigate('/entries'),
    'go-accounts': () => navigate('/accounts'),
    'go-drafts': () => navigate('/drafts'),
    'go-recurring': () => navigate('/extra/recurring'),
    'go-close-period': () => navigate('/extra/close-period'),
    'global-search': () => setShowSearch(true),
  })

  function handlePosted() {
    setShowNewEntry(false)
    window.dispatchEvent(new Event('cb:entry-posted'))
  }

  const pinnedReportMetas = ALL_REPORTS.filter((r) => pinnedReports.includes(r.id))

  return (
    <div className="flex h-screen bg-base overflow-hidden">
      {/* Sidebar */}
      <aside className="w-52 bg-void flex flex-col shrink-0 border-r border-rim">
        <button
          onClick={() => navigate('/home')}
          className="px-4 py-3 border-b border-rim w-full text-left hover:opacity-80 transition-opacity cursor-pointer"
        >
          <img src={logoSrc} alt="corebooks" className="w-full" />
        </button>

        <nav className="flex-1 py-4 px-2 overflow-y-auto space-y-1">
          <NavLink to="/home" className={navLinkClass}>Home</NavLink>
          <SidebarSection id="ledger" label="Ledger">
            <NavLink to="/accounts" className={navLinkClass}>Chart of Accounts</NavLink>
            <NavLink to="/entries" className={navLinkClass}>Entries</NavLink>
            <NavLink to="/drafts" className={navLinkClass}>Drafts</NavLink>
          </SidebarSection>
          <SidebarSection id="reports" label="Reports">
            {pinnedReportMetas.map((r) => (
              <NavLink key={r.id} to={r.path} className={navLinkClass}>{r.label}</NavLink>
            ))}
            <button
              onClick={() => navigate('/settings?tab=reports')}
              className="flex items-center px-3 py-2 rounded text-xs text-ash hover:text-chalk hover:bg-surface transition-colors cursor-pointer w-full text-left"
            >
              Browse all reports...
            </button>
          </SidebarSection>
          <SidebarSection id="extra-workflows" label="Extra Workflows">
            <NavLink to="/extra/recurring" className={navLinkClass}>Recurring</NavLink>
            <NavLink to="/extra/close-period" className={navLinkClass}>Close Period</NavLink>
          </SidebarSection>
        </nav>

        <div className="border-t border-rim px-2 py-3">
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              `settings-link flex items-center gap-0 px-3 py-2 rounded text-sm font-medium transition-colors overflow-hidden cursor-pointer ${
                isActive ? 'bg-raised text-neon border-l-2 border-neon pl-[10px]' : 'text-ash hover:bg-surface hover:text-chalk'
              }`
            }
          >
            <CogIcon />
            <span className="settings-label ml-2.5">Settings</span>
          </NavLink>
        </div>
      </aside>

      {/* Right column */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Top toolbar */}
        <header className="h-12 border-b border-rim bg-void grid grid-cols-[1fr_auto_1fr] items-center px-4 shrink-0">
          <div className="flex items-center min-w-0">
            <button
              onClick={() => navigate('/home')}
              className="text-sm font-medium text-chalk hover:text-neon transition-colors truncate max-w-[160px] cursor-pointer"
              title={companyName || 'corebooks'}
            >
              {companyName || 'corebooks'}
            </button>
          </div>

          <div className="w-72">
            <button
              onClick={() => setShowSearch(true)}
              className="w-full bg-surface border border-rim rounded-sm px-3 py-1 text-xs text-ash/50 text-left hover:border-neon/50 transition-colors focus:outline-none cursor-pointer"
            >
              Press / for global search
            </button>
          </div>

          <div className="flex items-center justify-end gap-2">
            <AIButtonPopover
              aiEnabled={aiConfig.enabled}
              ollamaConnected={ollamaConnected}
              panelOpen={aiPanelOpen}
              onTogglePanel={toggleAiPanel}
              onActivate={handleOllamaActivate}
            />
            <button
              onClick={() => setShowNewEntry(true)}
              className="bg-neon hover:bg-neon-dim text-void text-xs font-semibold px-3 py-1.5 rounded-sm transition-colors cursor-pointer"
            >
              + New Entry
            </button>
          </div>
        </header>

        {/* Content row: page + optional AI panel */}
        <div className="flex-1 flex overflow-hidden">
          <main key={location.key} className={`flex-1 overflow-auto p-6 min-w-0 ${slideClass}`}>
            <Outlet context={{ pendingImportCount }} />
          </main>

          {aiPanelOpen && (
            <AIPanel
              config={aiConfig}
              ollamaConnected={ollamaConnected}
              onClose={toggleAiPanel}
            />
          )}
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
        <VaultImportShim
          file={vaultImportFile}
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

// Temporary shim — replaced when ImportModal gains the preloadFile prop in Task 12
function VaultImportShim({ file, onClose, onImported }: {
  file: { name: string; path: string; text: string }
  onClose: () => void
  onImported: () => void
}) {
  useEffect(() => {
    console.log('[vault] pre-load import ready for:', file.name)
  }, [file.name])
  void onClose
  void onImported
  return null
}
