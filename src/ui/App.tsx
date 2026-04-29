import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import AccountsPage from './pages/AccountsPage'
import EntriesPage from './pages/EntriesPage'
import DraftsPage from './pages/DraftsPage'
import TrialBalancePage from './pages/TrialBalancePage'
import BalanceSheetPage from './pages/BalanceSheetPage'
import IncomeStatementPage from './pages/IncomeStatementPage'
import SettingsPage from './pages/SettingsPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/accounts" replace />} />
          <Route path="accounts" element={<AccountsPage />} />
          <Route path="entries" element={<EntriesPage />} />
          <Route path="drafts" element={<DraftsPage />} />
          <Route path="reports/trial-balance" element={<TrialBalancePage />} />
          <Route path="reports/balance-sheet" element={<BalanceSheetPage />} />
          <Route path="reports/income-statement" element={<IncomeStatementPage />} />
          <Route path="settings/database" element={<SettingsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
