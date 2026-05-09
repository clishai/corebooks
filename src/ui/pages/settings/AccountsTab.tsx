import { useState, useEffect } from 'react'
import { api } from '../../api/client'
import { ACCOUNT_TEMPLATES, type AccountTemplate } from '../../lib/accountTemplates'
import { ALL_ACCOUNT_COLUMNS, AccountColumnId, getVisibleColumns, saveVisibleColumns } from '../../lib/accountColumns'

const LIBRARY_GROUPS: Array<{ label: string; type: AccountTemplate['type'] }> = [
  { label: 'Assets', type: 'Asset' },
  { label: 'Liabilities', type: 'Liability' },
  { label: 'Equity', type: 'Equity' },
  { label: 'Revenue', type: 'Revenue' },
  { label: 'Expenses', type: 'Expense' },
]

export default function AccountsTab() {
  const [visible, setVisible] = useState<AccountColumnId[]>(getVisibleColumns)
  const [existingNumbers, setExistingNumbers] = useState<Set<string>>(new Set())
  const [addedNumbers, setAddedNumbers] = useState<Set<string>>(new Set())
  const [addingNumbers, setAddingNumbers] = useState<Set<string>>(new Set())
  const [expandedGroup, setExpandedGroup] = useState<AccountTemplate['type'] | null>(null)

  useEffect(() => {
    api.accounts.list()
      .then((accts) => setExistingNumbers(new Set(accts.map((a) => a.number))))
      .catch(() => {})
  }, [])

  function toggle(id: AccountColumnId) {
    const next = visible.includes(id) ? visible.filter((c) => c !== id) : [...visible, id]
    setVisible(next)
    saveVisibleColumns(next)
  }

  async function handleAddTemplate(t: AccountTemplate) {
    setAddingNumbers((prev) => new Set(prev).add(t.number))
    try {
      await api.accounts.create({
        number: t.number,
        name: t.name,
        type: t.type,
        normalBalance: t.normalBalance,
        isContra: t.isContra,
        contraTo: t.contraTo,
        classification: t.classification,
      })
      setAddedNumbers((prev) => new Set(prev).add(t.number))
    } catch {
      // skip duplicates
    } finally {
      setAddingNumbers((prev) => {
        const next = new Set(prev)
        next.delete(t.number)
        return next
      })
    }
  }

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-chalk">Visible columns</h3>
        <p className="text-sm text-ash leading-relaxed">
          Choose which columns appear in the chart of accounts. Account number and name are always shown.
        </p>
        <div className="bg-surface border border-rim rounded-lg divide-y divide-rim">
          {ALL_ACCOUNT_COLUMNS.map((col) => {
            const checked = visible.includes(col.id)
            return (
              <label
                key={col.id}
                onClick={() => toggle(col.id)}
                className="flex items-center gap-4 px-5 py-3.5 cursor-pointer hover:bg-raised transition-colors"
              >
                <div
                  className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                    checked ? 'bg-neon border-neon' : 'border-rim bg-base'
                  }`}
                >
                  {checked && (
                    <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                      <path
                        d="M1 4L3.5 6.5L9 1"
                        stroke="#0a0c12"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </div>
                <span className="text-sm text-chalk">{col.label}</span>
              </label>
            )
          })}
        </div>
        <p className="text-xs text-ash">
          Changes save automatically and take effect the next time you visit the accounts page.
        </p>
      </div>

      {/* Account Library */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-chalk">Account Library</h3>
        <p className="text-sm text-ash leading-relaxed">
          Add standard accounts to your chart of accounts. Expand a group to browse templates.
        </p>
        <div className="bg-surface border border-rim rounded-lg divide-y divide-rim">
          {LIBRARY_GROUPS.map(({ label, type }) => {
            const templates = ACCOUNT_TEMPLATES.filter((t) => t.type === type)
            const isExpanded = expandedGroup === type
            return (
              <div key={type}>
                <button
                  onClick={() => setExpandedGroup(isExpanded ? null : type)}
                  className="w-full flex items-center justify-between px-5 py-3 hover:bg-raised transition-colors"
                >
                  <span className="text-sm font-medium text-chalk">{label}</span>
                  <span className="text-ash text-xs">{isExpanded ? '▾' : '▸'}</span>
                </button>
                {isExpanded && (
                  <div className="border-t border-rim/50">
                    {templates.map((t) => {
                      const alreadyExists = existingNumbers.has(t.number) || addedNumbers.has(t.number)
                      const isAdding = addingNumbers.has(t.number)
                      return (
                        <div
                          key={t.number}
                          className="flex items-start justify-between px-5 py-2.5 border-b border-rim/30 last:border-0 hover:bg-raised/50"
                        >
                          <div className="flex-1 min-w-0 mr-3">
                            <div className="flex items-center gap-2">
                              <span className="text-ash text-xs font-mono">{t.number}</span>
                              <span className="text-chalk text-xs truncate">{t.name}</span>
                              {t.isContra && <span className="text-violet text-[10px]">contra</span>}
                            </div>
                            <p className="text-ash text-[10px] mt-0.5 line-clamp-1">{t.description}</p>
                          </div>
                          <button
                            onClick={() => !alreadyExists && handleAddTemplate(t)}
                            disabled={alreadyExists || isAdding}
                            className={`text-[10px] font-semibold shrink-0 px-2 py-1 rounded-sm border transition-colors ${
                              alreadyExists
                                ? 'border-rim text-ash cursor-default'
                                : 'border-neon text-neon hover:bg-neon hover:text-void'
                            }`}
                          >
                            {alreadyExists ? 'Added' : isAdding ? '…' : 'ADD+'}
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
