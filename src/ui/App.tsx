import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
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

function VaultGate({ children }: { children: React.ReactNode }) {
  const isElectron = typeof window !== 'undefined' && !!window.electronAPI
  const hasVault = isElectron ? window.electronAPI!.apiBaseUrl !== null : true

  if (isElectron && !hasVault) {
    return <VaultPickerPage />
  }
  return <>{children}</>
}

function AuthGate({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<'loading' | 'login' | 'setup' | 'ok'>('loading')

  useEffect(() => {
    checkAuthStatus().then(({ active, needsSetup }) => {
      if (!active) {
        setStatus('ok')
        return
      }
      if (needsSetup) {
        setStatus('setup')
        return
      }
      if (getAuthToken()) {
        setStatus('ok')
        return
      }
      setStatus('login')
    }).catch(() => {
      // If auth status check fails (e.g. SQLite mode where /auth/status is unreachable),
      // default to ok so the app is usable.
      setStatus('ok')
    })
  }, [])

  if (status === 'loading') return <div className="h-screen bg-base" />
  if (status === 'setup') return <LoginPage needsSetup onSuccess={() => setStatus('ok')} />
  if (status === 'login') return <LoginPage needsSetup={false} onSuccess={() => setStatus('ok')} />
  return <>{children}</>
}

export default function App() {
  return (
    <VaultGate>
      <AuthGate>
        <BrowserRouter>
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
              <Route path="settings/database" element={<Navigate to="/settings" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthGate>
    </VaultGate>
  )
}
