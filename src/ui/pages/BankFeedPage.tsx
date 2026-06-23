import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, type Account, type BankFeedImportResult } from '../api/client'

export default function BankFeedPage() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [bankAccountId, setBankAccountId] = useState('')
  const [csv, setCsv] = useState('')
  const [result, setResult] = useState<BankFeedImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    api.accounts.list().then((data) => {
      const assets = data.filter((account) => account.type === 'Asset')
      setAccounts(assets)
      setBankAccountId(assets[0]?.id ?? '')
    }).catch(() => {})
  }, [])

  async function handleImport(): Promise<void> {
    setImporting(true)
    setError(null)
    setResult(null)
    try {
      setResult(await api.bankFeed.importCsv(csv, bankAccountId))
      window.dispatchEvent(new Event('cb:drafts-changed'))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Bank feed import failed.')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="max-w-3xl space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-chalk">Bank Feed Import</h1>
          <p className="text-sm text-ash mt-1">Import bank CSV rows into draft entries using your rules.</p>
        </div>
        <button
          onClick={() => navigate('/settings?tab=bank-rules')}
          className="px-3 py-1.5 border border-rim rounded-sm text-xs text-ash hover:text-neon hover:border-neon/50 transition-colors cursor-pointer"
        >
          Configure rules
        </button>
      </div>

      <div className="bg-surface border border-rim rounded-sm px-5 py-5 space-y-4">
        <label className="block">
          <span className="block text-xs text-ash uppercase tracking-widest mb-2">Bank account</span>
          <select
            value={bankAccountId}
            onChange={(e) => setBankAccountId(e.target.value)}
            className="w-full bg-raised border border-rim rounded-sm px-3 py-2 text-sm text-chalk"
          >
            {accounts.map((account) => <option key={account.id} value={account.id}>{account.number} {account.name}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="block text-xs text-ash uppercase tracking-widest mb-2">CSV data</span>
          <textarea
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
            rows={12}
            placeholder="Date,Payee,Memo,Amount"
            className="w-full bg-void border border-rim rounded-sm px-3 py-2 text-sm text-chalk font-mono focus:outline-none focus:border-neon"
          />
        </label>
        <button
          onClick={() => void handleImport()}
          disabled={importing || !csv.trim() || !bankAccountId}
          className="px-4 py-2 bg-neon text-void text-sm font-semibold rounded-sm hover:bg-neon-dim disabled:opacity-40 transition-colors cursor-pointer"
        >
          {importing ? 'Creating drafts…' : 'Create draft entries'}
        </button>
      </div>

      {error && <div className="text-sm text-red-300 bg-red-950/50 border border-red-800 px-4 py-3 rounded-sm">{error}</div>}
      {result && (
        <div className="bg-surface border border-rim rounded-sm px-5 py-4">
          <p className="text-sm text-chalk">{result.draftsCreated} drafts created · {result.rowsSkipped} rows skipped</p>
          {result.warnings.length > 0 && (
            <ul className="mt-3 space-y-1 text-xs text-ash">
              {result.warnings.slice(0, 20).map((warning, i) => <li key={i}>{warning}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
