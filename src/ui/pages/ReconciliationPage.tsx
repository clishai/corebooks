import { useEffect, useState } from 'react'
import { api, type Account, type ReconciliationItem, type ReconciliationSession } from '../api/client'

function fmt(amount: number): string {
  return amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

export default function ReconciliationPage() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [sessions, setSessions] = useState<ReconciliationSession[]>([])
  const [active, setActive] = useState<ReconciliationSession | null>(null)
  const [items, setItems] = useState<ReconciliationItem[]>([])
  const [accountId, setAccountId] = useState('')
  const [statementDate, setStatementDate] = useState(new Date().toISOString().slice(0, 10))
  const [endingBalance, setEndingBalance] = useState('')
  const [error, setError] = useState<string | null>(null)

  function load(): void {
    Promise.all([api.accounts.list(), api.reconciliation.sessions()])
      .then(([accountData, sessionData]) => {
        const assets = accountData.filter((account) => account.type === 'Asset')
        setAccounts(assets)
        setAccountId((current) => current || assets[0]?.id || '')
        setSessions(sessionData)
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load reconciliation.'))
  }

  useEffect(() => { load() }, [])

  async function openSession(session: ReconciliationSession): Promise<void> {
    try {
      const [fresh, sessionItems] = await Promise.all([
        api.reconciliation.getSession(session.id),
        api.reconciliation.items(session.id),
      ])
      setActive(fresh)
      setItems(sessionItems)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to open reconciliation session.')
    }
  }

  async function createSession(): Promise<void> {
    const parsedBalance = Number(endingBalance)
    if (!Number.isFinite(parsedBalance)) {
      setError('Ending balance must be a number.')
      return
    }
    try {
      const session = await api.reconciliation.createSession({
        accountId,
        statementDate,
        endingBalance: parsedBalance,
      })
      setEndingBalance('')
      load()
      await openSession(session)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create reconciliation session.')
    }
  }

  async function setCleared(item: ReconciliationItem, cleared: boolean): Promise<void> {
    if (!active) return
    try {
      const updated = await api.reconciliation.setItem(active.id, item.entryId, cleared)
      setActive(updated)
      setItems((current) => current.map((candidate) => candidate.entryId === item.entryId ? { ...candidate, cleared } : candidate))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update cleared state.')
    }
  }

  async function closeActive(): Promise<void> {
    if (!active) return
    try {
      const updated = await api.reconciliation.close(active.id)
      setActive(updated)
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to close reconciliation session.')
    }
  }

  async function deleteActive(): Promise<void> {
    if (!active || !confirm('Delete this reconciliation session?')) return
    try {
      await api.reconciliation.delete(active.id)
      setActive(null)
      setItems([])
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete reconciliation session.')
    }
  }

  return (
    <div className="max-w-5xl space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-chalk">Reconciliation</h1>
        <p className="text-sm text-ash mt-1">Check posted entries against a statement balance.</p>
      </div>
      {error && <p className="text-sm text-red-300">{error}</p>}

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <aside className="space-y-4">
          <div className="bg-surface border border-rim rounded-sm px-4 py-4 space-y-3">
            <h3 className="text-sm font-semibold text-chalk">New session</h3>
            <select className="w-full bg-raised border border-rim rounded-sm px-3 py-2 text-sm text-chalk" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {accounts.map((account) => <option key={account.id} value={account.id}>{account.number} {account.name}</option>)}
            </select>
            <input type="date" className="w-full bg-raised border border-rim rounded-sm px-3 py-2 text-sm text-chalk" value={statementDate} onChange={(e) => setStatementDate(e.target.value)} />
            <input className="w-full bg-raised border border-rim rounded-sm px-3 py-2 text-sm text-chalk" placeholder="Ending balance" value={endingBalance} onChange={(e) => setEndingBalance(e.target.value)} />
            <button onClick={() => void createSession()} disabled={!accountId || !endingBalance} className="w-full bg-neon text-void text-sm font-semibold rounded-sm px-3 py-2 disabled:opacity-40 cursor-pointer">Start</button>
          </div>
          <div className="bg-surface border border-rim rounded-sm divide-y divide-rim">
            {sessions.map((session) => (
              <button key={session.id} onClick={() => void openSession(session)} className="w-full text-left px-4 py-3 hover:bg-raised/50 transition-colors cursor-pointer">
                <span className="block text-sm text-chalk">
                  {accounts.find((account) => account.id === session.accountId)?.name ?? 'Account'} · {new Date(session.statementDate).toLocaleDateString()}
                </span>
                <span className="block text-xs text-ash">{session.status} · diff {fmt(session.difference)}</span>
              </button>
            ))}
          </div>
        </aside>

        <section className="bg-surface border border-rim rounded-sm overflow-hidden">
          {!active ? (
            <p className="px-5 py-8 text-sm text-ash">Select or create a reconciliation session.</p>
          ) : (
            <>
              <div className="px-5 py-4 border-b border-rim flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm text-chalk">Statement {new Date(active.statementDate).toLocaleDateString()}</p>
                  <p className="text-xs text-ash">Ending {fmt(active.endingBalance)} · cleared {fmt(active.clearedBalance)} · difference {fmt(active.difference)}</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => void closeActive()} disabled={Math.abs(active.difference) > 0.009 || active.status === 'closed'} className="px-3 py-1.5 border border-neon/40 text-neon rounded-sm text-xs disabled:opacity-40 cursor-pointer">Close</button>
                  <button onClick={() => void deleteActive()} className="px-3 py-1.5 border border-rim text-ash hover:text-red-400 rounded-sm text-xs cursor-pointer">Delete</button>
                </div>
              </div>
              <div className="max-h-[560px] overflow-auto">
                {items.map((item) => (
                  <label key={item.entryId} className="flex items-center gap-3 px-5 py-2.5 border-b border-rim/40 hover:bg-raised/30">
                    <input type="checkbox" checked={item.cleared} onChange={(e) => void setCleared(item, e.target.checked)} className="accent-neon" />
                    <span className="w-28 text-xs text-ash">{new Date(item.date).toLocaleDateString()}</span>
                    <span className="flex-1 text-sm text-chalk">{item.memo}</span>
                    <span className="font-mono text-sm text-ash">{fmt(item.amount)}</span>
                  </label>
                ))}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  )
}
