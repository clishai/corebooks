import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { checkAuthStatus } from '../lib/auth'
import VaultTab from './settings/VaultTab'
import GeneralTab from './settings/GeneralTab'
import NavigationTab from './settings/NavigationTab'
import AccountsTab from './settings/AccountsTab'
import PaymentMethodsTab from './settings/PaymentMethodsTab'
import AccountingTab from './settings/AccountingTab'
import ShortcutsTab from './settings/ShortcutsTab'
import UsersTab from './settings/UsersTab'
import DatabaseTab from './settings/DatabaseTab'
import ReportsTab from './settings/ReportsTab'
import AITab from './settings/AITab'
import BankRulesTab from './settings/BankRulesTab'
import PluginsTab from './settings/PluginsTab'
import AuditTab from './settings/AuditTab'

type Tab =
  | 'vault' | 'general' | 'navigation' | 'accounts' | 'payment-methods'
  | 'accounting' | 'bank-rules' | 'shortcuts' | 'ai' | 'plugins'
  | 'audit' | 'users' | 'database' | 'reports'

interface Category {
  id: Tab
  label: string
  authRequired?: boolean
}

const CATEGORIES: Category[] = [
  { id: 'general', label: 'General' },
  { id: 'navigation', label: 'Navigation' },
  { id: 'vault', label: 'Vault' },
  { id: 'accounts', label: 'Accounts' },
  { id: 'payment-methods', label: 'Payment Methods' },
  { id: 'accounting', label: 'Accounting' },
  { id: 'bank-rules', label: 'Bank Rules' },
  { id: 'shortcuts', label: 'Shortcuts' },
  { id: 'ai', label: 'AI' },
  { id: 'plugins', label: 'Plugins' },
  { id: 'audit', label: 'Audit' },
  { id: 'users', label: 'Users', authRequired: true },
  { id: 'database', label: 'Database' },
  { id: 'reports', label: 'Reports' },
]

const VALID_TABS = CATEGORIES.map((c) => c.id)

export default function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const initialTab = searchParams.get('tab') as Tab | null
  const [tab, setTab] = useState<Tab>(
    initialTab && VALID_TABS.includes(initialTab) ? initialTab : 'general',
  )
  const [authActive, setAuthActive] = useState(false)
  const [search, setSearch] = useState('')

  useEffect(() => {
    checkAuthStatus().then(({ active }) => setAuthActive(active)).catch(() => {})
  }, [])

  useEffect(() => {
    const nextTab = searchParams.get('tab') as Tab | null
    if (nextTab && VALID_TABS.includes(nextTab)) setTab(nextTab)
  }, [searchParams])

  function selectTab(nextTab: Tab): void {
    setTab(nextTab)
    setSearchParams({ tab: nextTab })
    setSearch('')
  }

  const visibleCategories = useMemo(() => {
    const base = CATEGORIES.filter((c) => !c.authRequired || authActive)
    if (!search.trim()) return base
    const q = search.toLowerCase()
    return base.filter((c) => c.label.toLowerCase().includes(q))
  }, [search, authActive])

  return (
    <div className="flex gap-0 h-full -m-6">
      {/* Left rail */}
      <div className="w-40 shrink-0 border-r border-rim flex flex-col bg-void">
        <div className="p-3 border-b border-rim">
          <h1 className="text-xs font-semibold text-chalk mb-2 uppercase tracking-wider">Settings</h1>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="w-full bg-surface border border-rim rounded px-2 py-1 text-xs text-chalk placeholder:text-ash focus:outline-none focus:border-neon"
          />
        </div>
        <nav className="flex-1 overflow-y-auto py-2 px-1.5">
          {visibleCategories.length === 0 ? (
            <p className="text-xs text-ash px-2 py-3">No results</p>
          ) : (
            visibleCategories.map((c) => (
              <button
                key={c.id}
                onClick={() => selectTab(c.id)}
                className={`w-full text-left px-3 py-2 rounded text-sm transition-colors mb-0.5 cursor-pointer ${
                  tab === c.id
                    ? 'bg-raised text-neon border-l-2 border-neon pl-[10px]'
                    : 'text-ash border-l-2 border-transparent hover:bg-surface hover:text-chalk'
                }`}
              >
                {c.label}
              </button>
            ))
          )}
        </nav>
      </div>

      {/* Right panel */}
      <div className="flex-1 overflow-y-auto p-6 min-w-0">
        {tab === 'vault' && <VaultTab />}
        {tab === 'general' && <GeneralTab />}
        {tab === 'navigation' && <NavigationTab />}
        {tab === 'accounts' && <AccountsTab />}
        {tab === 'payment-methods' && <PaymentMethodsTab />}
        {tab === 'accounting' && <AccountingTab />}
        {tab === 'bank-rules' && <BankRulesTab />}
        {tab === 'shortcuts' && <ShortcutsTab />}
        {tab === 'ai' && <AITab />}
        {tab === 'plugins' && <PluginsTab />}
        {tab === 'audit' && <AuditTab />}
        {tab === 'users' && <UsersTab />}
        {tab === 'database' && <DatabaseTab />}
        {tab === 'reports' && <ReportsTab />}
      </div>
    </div>
  )
}
