import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import HomePage from './pages/HomePage'
import AccountsPage from './pages/AccountsPage'
import EntriesPage from './pages/EntriesPage'
import DraftsPage from './pages/DraftsPage'
import TrialBalancePage from './pages/TrialBalancePage'
import BalanceSheetPage from './pages/BalanceSheetPage'
import IncomeStatementPage from './pages/IncomeStatementPage'
import ReportsLibraryPage from './pages/ReportsLibraryPage'
import SettingsPage from './pages/SettingsPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/home" replace />} />
          <Route path="home" element={<HomePage />} />
          <Route path="accounts" element={<AccountsPage />} />
          <Route path="entries" element={<EntriesPage />} />
          <Route path="drafts" element={<DraftsPage />} />
          <Route path="reports/trial-balance" element={<TrialBalancePage />} />
          <Route path="reports/balance-sheet" element={<BalanceSheetPage />} />
          <Route path="reports/income-statement" element={<IncomeStatementPage />} />
          <Route path="reports/library" element={<ReportsLibraryPage />} />
          <Route path="extra/recurring" element={<div className="p-6 text-ash text-sm">Recurring transactions — coming soon.</div>} />
          <Route path="extra/close-period" element={<div className="p-6 text-ash text-sm">Close Period — coming soon.</div>} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="settings/database" element={<Navigate to="/settings" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
