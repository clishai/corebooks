import { useEffect, useState } from 'react'
import { api, type Account, type BankRule, type BankRuleInput } from '../../api/client'

const blankRule: BankRuleInput = {
  name: '',
  priority: 100,
  enabled: true,
  matchField: 'memo',
  matchType: 'contains',
  pattern: '',
  accountId: '',
  entryType: 'expense',
  memo: '',
  paymentMethod: 'Bank feed',
}

export default function BankRulesTab() {
  const [rules, setRules] = useState<BankRule[]>([])
  const [templates, setTemplates] = useState<Array<Omit<BankRuleInput, 'accountId'>>>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [draft, setDraft] = useState<BankRuleInput>(blankRule)
  const [error, setError] = useState<string | null>(null)

  function load(): void {
    Promise.all([api.bankFeed.rules(), api.bankFeed.templates(), api.accounts.list()])
      .then(([ruleData, templateData, accountData]) => {
        setRules(ruleData)
        setTemplates(templateData)
        setAccounts(accountData)
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load bank rules.'))
  }

  useEffect(() => { load() }, [])

  async function saveRule(): Promise<void> {
    if (!draft.name.trim() || !draft.pattern.trim()) {
      setError('Rule name and pattern are required.')
      return
    }
    try {
      await api.bankFeed.createRule({ ...draft, accountId: draft.accountId || null })
      setDraft(blankRule)
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save bank rule.')
    }
  }

  async function deleteRule(id: string): Promise<void> {
    try {
      await api.bankFeed.deleteRule(id)
      setRules((current) => current.filter((rule) => rule.id !== id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete bank rule.')
    }
  }

  function applyTemplate(template: Omit<BankRuleInput, 'accountId'>): void {
    setDraft({ ...blankRule, ...template })
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="bg-surface border border-rim rounded-sm px-5 py-4">
        <h3 className="text-sm font-semibold text-chalk mb-1">Bank feed rules</h3>
        <p className="text-sm text-ash leading-relaxed">
          Rules classify imported bank rows into draft entries. They never post official entries.
          Lower priority numbers run first, and every rule can be deleted in one click.
        </p>
      </div>

      {error && <p className="text-sm text-red-300">{error}</p>}

      <div className="grid gap-3 md:grid-cols-3">
        {templates.map((template) => (
          <button
            key={template.name}
            onClick={() => applyTemplate(template)}
            className="text-left bg-surface border border-rim rounded-sm px-4 py-3 hover:border-neon/50 transition-colors cursor-pointer"
          >
            <span className="block text-sm text-chalk">{template.name}</span>
            <span className="block text-xs text-ash mt-1">{template.matchField} {template.matchType} "{template.pattern}"</span>
          </button>
        ))}
      </div>

      <div className="bg-surface border border-rim rounded-sm px-5 py-5 space-y-3">
        <h3 className="text-sm font-semibold text-chalk">Add rule</h3>
        <div className="grid gap-3 md:grid-cols-2">
          <input className="bg-raised border border-rim rounded-sm px-3 py-2 text-sm text-chalk" placeholder="Rule name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          <input className="bg-raised border border-rim rounded-sm px-3 py-2 text-sm text-chalk" placeholder="Pattern" value={draft.pattern} onChange={(e) => setDraft({ ...draft, pattern: e.target.value })} />
          <select className="bg-raised border border-rim rounded-sm px-3 py-2 text-sm text-chalk" value={draft.matchField} onChange={(e) => setDraft({ ...draft, matchField: e.target.value as BankRuleInput['matchField'] })}>
            <option value="memo">Memo</option>
            <option value="payee">Payee</option>
            <option value="amount">Amount</option>
          </select>
          <select className="bg-raised border border-rim rounded-sm px-3 py-2 text-sm text-chalk" value={draft.matchType} onChange={(e) => setDraft({ ...draft, matchType: e.target.value as BankRuleInput['matchType'] })}>
            <option value="contains">Contains</option>
            <option value="startsWith">Starts with</option>
            <option value="equals">Equals</option>
          </select>
          <select className="bg-raised border border-rim rounded-sm px-3 py-2 text-sm text-chalk" value={draft.accountId ?? ''} onChange={(e) => setDraft({ ...draft, accountId: e.target.value })}>
            <option value="">Choose target account…</option>
            {accounts.map((account) => <option key={account.id} value={account.id}>{account.number} {account.name}</option>)}
          </select>
          <input className="bg-raised border border-rim rounded-sm px-3 py-2 text-sm text-chalk" placeholder="Draft memo" value={draft.memo ?? ''} onChange={(e) => setDraft({ ...draft, memo: e.target.value })} />
        </div>
        <button onClick={() => void saveRule()} className="px-4 py-2 bg-neon text-void text-sm font-semibold rounded-sm hover:bg-neon-dim transition-colors cursor-pointer">Add rule</button>
      </div>

      <div className="bg-surface border border-rim rounded-sm divide-y divide-rim">
        {rules.length === 0 ? (
          <p className="px-5 py-4 text-sm text-ash">No bank rules yet. Add one or start from a template.</p>
        ) : rules.map((rule) => (
          <div key={rule.id} className="px-5 py-3 flex items-center gap-3">
            <div className="flex-1">
              <p className="text-sm text-chalk">{rule.name}</p>
              <p className="text-xs text-ash">{rule.matchField} {rule.matchType} "{rule.pattern}" → {accounts.find((a) => a.id === rule.accountId)?.name ?? 'No account selected'}</p>
            </div>
            <button onClick={() => void deleteRule(rule.id)} className="text-xs text-ash hover:text-red-400 transition-colors cursor-pointer">Delete</button>
          </div>
        ))}
      </div>
    </div>
  )
}
