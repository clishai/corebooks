import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { checkAuthStatus } from '../lib/auth'
import VaultTab from './settings/VaultTab'
import GeneralTab from './settings/GeneralTab'
import AccountsTab from './settings/AccountsTab'
import PaymentMethodsTab from './settings/PaymentMethodsTab'
import AccountingTab from './settings/AccountingTab'
import ShortcutsTab from './settings/ShortcutsTab'
import UsersTab from './settings/UsersTab'
import DatabaseTab from './settings/DatabaseTab'
import ReportsTab from './settings/ReportsTab'
import AITab from './settings/AITab'

type Tab = 'vault' | 'general' | 'accounts' | 'payment-methods' | 'accounting' | 'shortcuts' | 'ai' | 'users' | 'database' | 'reports'

const VALID_TABS: Tab[] = ['vault', 'general', 'accounts', 'payment-methods', 'accounting', 'shortcuts', 'ai', 'users', 'database', 'reports']

export default function SettingsPage() {
  const [searchParams] = useSearchParams()
  const initialTab = searchParams.get('tab') as Tab | null
  const [tab, setTab] = useState<Tab>(
    initialTab && VALID_TABS.includes(initialTab) ? initialTab : 'general',
  )
  const [authActive, setAuthActive] = useState(false)

  useEffect(() => {
    checkAuthStatus().then(({ active }) => setAuthActive(active)).catch(() => {})
  }, [])

  const tabClass = (t: Tab) =>
    `px-4 py-2 text-sm font-medium rounded-md transition-colors cursor-pointer ${
      tab === t ? 'bg-raised text-chalk' : 'text-ash hover:text-chalk hover:bg-surface'
    }`

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-chalk">settings</h1>
        <p className="text-sm text-ash mt-1">Application configuration.</p>
      </div>

      <div className="flex flex-wrap gap-1 mb-6 bg-void border border-rim rounded-lg p-1 w-fit">
        <button className={tabClass('vault')} onClick={() => setTab('vault')}>vault</button>
        <button className={tabClass('general')} onClick={() => setTab('general')}>general</button>
        <button className={tabClass('accounts')} onClick={() => setTab('accounts')}>accounts</button>
        <button className={tabClass('payment-methods')} onClick={() => setTab('payment-methods')}>payment methods</button>
        <button className={tabClass('accounting')} onClick={() => setTab('accounting')}>accounting</button>
        <button className={tabClass('shortcuts')} onClick={() => setTab('shortcuts')}>shortcuts</button>
        <button className={tabClass('ai')} onClick={() => setTab('ai')}>ai</button>
        {authActive && (
          <button className={tabClass('users')} onClick={() => setTab('users')}>users</button>
        )}
        <button className={tabClass('database')} onClick={() => setTab('database')}>database</button>
        <button className={tabClass('reports')} onClick={() => setTab('reports')}>reports</button>
      </div>

      {tab === 'vault' && <VaultTab />}
      {tab === 'general' && <GeneralTab />}
      {tab === 'accounts' && <AccountsTab />}
      {tab === 'payment-methods' && <PaymentMethodsTab />}
      {tab === 'accounting' && <AccountingTab />}
      {tab === 'shortcuts' && <ShortcutsTab />}
      {tab === 'ai' && <AITab />}
      {tab === 'users' && <UsersTab />}
      {tab === 'database' && <DatabaseTab />}
      {tab === 'reports' && <ReportsTab />}
    </div>
  )
}
