import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import AccountsPage from './pages/AccountsPage'
import EntriesPage from './pages/EntriesPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/accounts" replace />} />
          <Route path="accounts" element={<AccountsPage />} />
          <Route path="entries" element={<EntriesPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
