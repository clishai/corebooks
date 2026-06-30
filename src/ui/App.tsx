import { useState, useEffect, Component } from 'react'
import type { ReactNode } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import HomePage from './pages/HomePage'
import AccountsPage from './pages/AccountsPage'
import EntriesPage from './pages/EntriesPage'
import DraftsPage from './pages/DraftsPage'
import TrialBalancePage from './pages/TrialBalancePage'
import BalanceSheetPage from './pages/BalanceSheetPage'
import IncomeStatementPage from './pages/IncomeStatementPage'
import SettingsPage from './pages/SettingsPage'
import RecurringPage from './pages/RecurringPage'
import ClosePeriodPage from './pages/ClosePeriodPage'
import BankFeedPage from './pages/BankFeedPage'
import ReconciliationPage from './pages/ReconciliationPage'
import GeneralLedgerPage from './pages/GeneralLedgerPage'
import AccountActivityPage from './pages/AccountActivityPage'
import CashFlowPage from './pages/CashFlowPage'
import ReportsLibraryPage from './pages/ReportsLibraryPage'
import LoginPage from './pages/LoginPage'
import VaultPickerPage from './pages/VaultPickerPage'
import { checkAuthStatus, getAuthToken } from './lib/auth'
import { readLocalLegacySettings, markLegacyMigrationComplete } from './lib/migrateLocalStorage'
import { api } from './api/client'

// ── Error boundary ────────────────────────────────────────────────────────────

interface ErrorBoundaryState { hasError: boolean; message: string }

class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { hasError: false, message: '' }
  }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    const message = error instanceof Error ? error.message : String(error)
    return { hasError: true, message }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-base flex flex-col items-center justify-center px-6 py-12 text-center">
          <span className="font-mono font-light text-chalk text-2xl tracking-tight mb-8">~/ corebooks</span>
          <p className="text-red-400 text-sm font-semibold mb-2">Something went wrong</p>
          <p className="text-ash text-xs font-mono max-w-md mb-6 leading-relaxed">{this.state.message}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-neon hover:bg-neon-dim text-void text-sm font-bold rounded-md transition-colors cursor-pointer"
          >
            Reload
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

// ── Migration flag (in-memory, one session only) ──────────────────────────────

// Exported so GeneralTab can read it without going through localStorage.
// Set to true after a successful legacy-settings migration in this session.
export let migrationRanThisSession = false

// ── Post-vault migration runner ───────────────────────────────────────────────

// Renders nothing. On first mount (which only happens after apiBaseUrl is set)
// checks for legacy localStorage keys and, if found, posts them to the vault DB
// via the existing /settings/app-settings endpoint, then clears them.
function MigrationRunner() {
  useEffect(() => {
    const legacy = readLocalLegacySettings()
    if (!legacy) return

    const payload: Record<string, unknown> = {}
    if (legacy.companyName !== undefined) payload['companyName'] = legacy.companyName
    if (legacy.featureFlags !== undefined) payload['featureFlags'] = JSON.stringify(legacy.featureFlags)
    if (legacy.paymentMethods !== undefined) payload['paymentMethods'] = JSON.stringify(legacy.paymentMethods)

    if (Object.keys(payload).length === 0) {
      markLegacyMigrationComplete()
      return
    }

    api.settings.saveAppSettings(payload)
      .then(() => {
        markLegacyMigrationComplete()
        migrationRanThisSession = true
      })
      .catch(() => {
        // Non-fatal: leave legacy keys in place so we can retry next launch.
      })
  }, [])

  return null
}

// ── Vault gate ────────────────────────────────────────────────────────────────

function VaultGate({ children }: { children: ReactNode }) {
  const isElectron = typeof window !== 'undefined' && !!window.electronAPI
  const hasVault = isElectron ? window.electronAPI!.apiBaseUrl !== null : true

  if (isElectron && !hasVault) {
    return <VaultPickerPage />
  }
  return (
    <>
      <MigrationRunner />
      {children}
    </>
  )
}

// ── Auth gate ─────────────────────────────────────────────────────────────────

function AuthGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<'loading' | 'login' | 'setup' | 'ok'>('loading')

  useEffect(() => {
    checkAuthStatus().then(({ active, needsSetup }) => {
      if (!active) { setStatus('ok'); return }
      if (needsSetup) { setStatus('setup'); return }
      if (getAuthToken()) { setStatus('ok'); return }
      setStatus('login')
    }).catch(() => {
      setStatus('ok')
    })
  }, [])

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-base flex flex-col items-center justify-center gap-3">
        <span className="font-mono font-light text-chalk text-xl tracking-tight">~/ corebooks</span>
        <div className="w-4 h-4 border-2 border-neon/30 border-t-neon rounded-full animate-spin mt-2" />
      </div>
    )
  }
  if (status === 'setup') return <LoginPage needsSetup onSuccess={() => setStatus('ok')} />
  if (status === 'login') return <LoginPage needsSetup={false} onSuccess={() => setStatus('ok')} />
  return <>{children}</>
}

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <ErrorBoundary>
      <VaultGate>
        <AuthGate>
          <HashRouter>
            <Routes>
              <Route path="/" element={<Layout />}>
                <Route index element={<Navigate to="/home" replace />} />
                <Route path="home" element={<HomePage />} />
                <Route path="accounts" element={<AccountsPage />} />
                <Route path="entries" element={<EntriesPage />} />
                <Route path="drafts" element={<DraftsPage />} />
                <Route path="reports" element={<ReportsLibraryPage />} />
                <Route path="reports/trial-balance" element={<TrialBalancePage />} />
                <Route path="reports/balance-sheet" element={<BalanceSheetPage />} />
                <Route path="reports/income-statement" element={<IncomeStatementPage />} />
                <Route path="reports/general-ledger" element={<GeneralLedgerPage />} />
                <Route path="reports/account-activity" element={<AccountActivityPage />} />
                <Route path="reports/cash-flow" element={<CashFlowPage />} />
                <Route path="reports/library" element={<Navigate to="/reports" replace />} />
                <Route path="extra/recurring" element={<RecurringPage />} />
                <Route path="extra/close-period" element={<ClosePeriodPage />} />
                <Route path="extra/bank-feed" element={<BankFeedPage />} />
                <Route path="extra/reconciliation" element={<ReconciliationPage />} />
                <Route path="settings" element={<SettingsPage />} />
                <Route path="settings/database" element={<Navigate to="/settings?tab=database" replace />} />
              </Route>
            </Routes>
          </HashRouter>
        </AuthGate>
      </VaultGate>
    </ErrorBoundary>
  )
}
