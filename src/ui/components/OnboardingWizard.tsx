import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  type BusinessType,
  saveBusinessType,
  saveFeatureFlags,
} from '../lib/featureFlags'
import { getTemplatesForBusinessType } from '../lib/accountTemplates'
import { api } from '../api/client'

const WELCOMED_KEY = 'cb_welcomed'
export const COMPANY_NAME_KEY = 'cb_company_name'

export function shouldShowOnboarding(): boolean {
  return !localStorage.getItem(WELCOMED_KEY)
}

export function getCompanyName(): string {
  return localStorage.getItem(COMPANY_NAME_KEY) ?? 'corebooks'
}

interface Props {
  onDismiss: () => void
}

type Step = 'welcome' | 'type' | 'accounts' | 'ready'

type BusinessTypeUI =
  | 'sole-proprietor'
  | 'llc-partnership'
  | 'corporation'
  | 'nonprofit'
  | 'learning'
  | 'other'

const BUSINESS_TYPE_MAP: Record<BusinessTypeUI, BusinessType> = {
  'sole-proprietor': 'freelancer',
  'llc-partnership': 'service',
  'corporation': 'product',
  'nonprofit': 'nonprofit',
  'learning': 'other',
  'other': 'other',
}

const BUSINESS_TYPES: { id: BusinessTypeUI; label: string; sublabel: string }[] = [
  { id: 'sole-proprietor', label: 'Sole Proprietor', sublabel: 'Independent contractor or self-employed' },
  { id: 'llc-partnership', label: 'LLC / Partnership', sublabel: 'Multi-member or partnership entity' },
  { id: 'corporation', label: 'Corporation', sublabel: 'C-corp, S-corp, or similar' },
  { id: 'nonprofit', label: 'Nonprofit', sublabel: 'Charity, association, or non-commercial entity' },
  { id: 'learning', label: 'Learning / Practice', sublabel: 'Students learning double-entry bookkeeping' },
  { id: 'other', label: 'Other', sublabel: "I'll set everything up myself" },
]

export default function OnboardingWizard({ onDismiss }: Props) {
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>('welcome')
  const [companyName, setCompanyName] = useState(() => localStorage.getItem(COMPANY_NAME_KEY) ?? '')
  const [businessTypeUI, setBusinessTypeUI] = useState<BusinessTypeUI | null>(null)
  const [selectedTemplates, setSelectedTemplates] = useState<Set<string>>(new Set())
  const [addingTemplates, setAddingTemplates] = useState(false)

  const stepNum = step === 'welcome' ? 1 : step === 'type' ? 2 : step === 'accounts' ? 3 : 4

  const mappedBusinessType: BusinessType = businessTypeUI
    ? BUSINESS_TYPE_MAP[businessTypeUI]
    : 'other'
  const suggestedTemplates = getTemplatesForBusinessType(mappedBusinessType).slice(0, 12)

  function handleWelcomeNext() {
    setStep('type')
  }

  function handleTypeNext() {
    const bt = businessTypeUI ? BUSINESS_TYPE_MAP[businessTypeUI] : 'other'
    const templates = getTemplatesForBusinessType(bt).slice(0, 12)
    setSelectedTemplates(new Set(templates.map((t) => t.number)))
    setStep('accounts')
  }

  function toggleTemplate(number: string) {
    setSelectedTemplates((prev) => {
      const next = new Set(prev)
      next.has(number) ? next.delete(number) : next.add(number)
      return next
    })
  }

  async function addSelectedAccounts() {
    for (const t of suggestedTemplates.filter((t) => selectedTemplates.has(t.number))) {
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
      } catch {
        // skip already-existing accounts
      }
    }
  }

  async function handleAccountsNext() {
    setAddingTemplates(true)
    await addSelectedAccounts()
    setAddingTemplates(false)
    setStep('ready')
  }

  function handleSkipAccounts() {
    setStep('ready')
  }

  function saveAndDismiss() {
    const name = companyName.trim()
    if (name) localStorage.setItem(COMPANY_NAME_KEY, name)
    if (businessTypeUI) saveBusinessType(BUSINESS_TYPE_MAP[businessTypeUI])
    saveFeatureFlags({ ar_ap: false, inventory: false })
    localStorage.setItem(WELCOMED_KEY, '1')
    onDismiss()
  }

  function handleReady(action: 'new-entry' | 'account-library' | 'home') {
    saveAndDismiss()
    if (action === 'new-entry') {
      window.dispatchEvent(new CustomEvent('cb:open-new-entry'))
    } else if (action === 'account-library') {
      navigate('/accounts')
    } else {
      navigate('/home')
    }
  }

  function skip() {
    saveAndDismiss()
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-surface border border-rim rounded-xl shadow-2xl w-full max-w-lg flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-7 pt-6 pb-0">
          <span className="text-xs text-ash font-medium tabular-nums">step {stepNum} of 4</span>
          {step !== 'ready' && (
            <button onClick={skip} className="text-xs text-ash hover:text-chalk transition-colors">
              Skip setup →
            </button>
          )}
        </div>

        {/* Body */}
        <div className="px-7 py-6 space-y-5">

          {/* Step 1: Welcome */}
          {step === 'welcome' && (
            <>
              <h2 className="text-lg font-bold text-chalk lowercase">welcome to corebooks</h2>
              <p className="text-sm text-ash">Open-source accounting for any business, any scale.</p>
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-chalk" htmlFor="company-name">
                  What&apos;s your company or vault name?
                </label>
                <input
                  id="company-name"
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleWelcomeNext() }}
                  placeholder="e.g. Acme Corp"
                  className="w-full bg-base border border-rim rounded-md px-3 py-2 text-chalk placeholder:text-ash focus:outline-none focus:border-neon text-sm"
                  autoFocus
                />
                <p className="text-xs text-ash">You can rename it later in Settings → Vault.</p>
              </div>
            </>
          )}

          {/* Step 2: Business type */}
          {step === 'type' && (
            <>
              <h2 className="text-lg font-bold text-chalk lowercase">what kind of business?</h2>
              <p className="text-sm text-ash">We&apos;ll suggest starter accounts. You can change this later.</p>
              <div className="grid grid-cols-2 gap-3">
                {BUSINESS_TYPES.map((bt) => (
                  <button
                    key={bt.id}
                    onClick={() => setBusinessTypeUI(bt.id)}
                    className={`text-left border rounded-lg px-4 py-3 transition-colors cursor-pointer ${
                      businessTypeUI === bt.id
                        ? 'border-neon bg-neon/5'
                        : 'border-rim bg-raised hover:border-neon/40'
                    }`}
                  >
                    <p className="text-sm font-semibold text-chalk">{bt.label}</p>
                    <p className="text-xs mt-0.5 text-ash">{bt.sublabel}</p>
                  </button>
                ))}
              </div>
            </>
          )}

          {/* Step 3: Chart of accounts */}
          {step === 'accounts' && (
            <>
              <h2 className="text-lg font-bold text-chalk lowercase">starter accounts</h2>
              <p className="text-sm text-ash">
                These accounts will be added to your chart of accounts. Uncheck any you don&apos;t need.
              </p>
              {suggestedTemplates.length > 0 ? (
                <div className="bg-void border border-rim rounded-lg divide-y divide-rim max-h-64 overflow-y-auto">
                  {suggestedTemplates.map((t) => {
                    const checked = selectedTemplates.has(t.number)
                    return (
                      <label
                        key={t.number}
                        onClick={() => toggleTemplate(t.number)}
                        className="flex items-start gap-4 px-5 py-3 cursor-pointer hover:bg-surface transition-colors"
                      >
                        <div
                          className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
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
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-ash text-xs font-mono">{t.number}</span>
                            <span className="text-sm font-medium text-chalk truncate">{t.name}</span>
                            {t.isContra && <span className="text-violet text-[10px]">contra</span>}
                          </div>
                          <p className="text-xs text-ash mt-0.5 line-clamp-1">{t.description}</p>
                        </div>
                      </label>
                    )
                  })}
                </div>
              ) : (
                <p className="text-sm text-ash">
                  No template suggestions for this type. You can add accounts from the Account Library after setup.
                </p>
              )}
              <p className="text-xs text-ash">More accounts available in the Account Library after setup.</p>
            </>
          )}

          {/* Step 4: Ready */}
          {step === 'ready' && (
            <>
              <h2 className="text-lg font-bold text-chalk lowercase">you&apos;re all set</h2>
              <p className="text-sm text-ash">What would you like to do first?</p>
              <div className="space-y-3">
                <button
                  onClick={() => handleReady('new-entry')}
                  className="w-full text-left border border-rim bg-raised hover:border-neon/40 hover:bg-raised/80 rounded-lg px-5 py-3.5 transition-colors cursor-pointer"
                >
                  <p className="text-sm font-semibold text-chalk">Create my first journal entry</p>
                </button>
                <button
                  onClick={() => handleReady('account-library')}
                  className="w-full text-left border border-rim bg-raised hover:border-neon/40 hover:bg-raised/80 rounded-lg px-5 py-3.5 transition-colors cursor-pointer"
                >
                  <p className="text-sm font-semibold text-chalk">Browse the account library</p>
                </button>
                <button
                  onClick={() => handleReady('home')}
                  className="w-full text-left border border-rim bg-raised hover:border-neon/40 hover:bg-raised/80 rounded-lg px-5 py-3.5 transition-colors cursor-pointer"
                >
                  <p className="text-sm font-semibold text-chalk">Take me to the home page</p>
                </button>
              </div>
              <p className="text-xs text-ash">
                Additional features can be enabled at any time in{' '}
                <strong className="text-chalk">Settings → Features</strong>.
              </p>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-7 pb-7">
          {step === 'type' && (
            <button
              onClick={() => setStep('welcome')}
              className="text-sm text-ash hover:text-chalk transition-colors"
            >
              ← Back
            </button>
          )}
          {step === 'accounts' && (
            <button
              onClick={() => setStep('type')}
              className="text-sm text-ash hover:text-chalk transition-colors"
            >
              ← Back
            </button>
          )}
          {(step === 'welcome' || step === 'ready') && <span />}

          {step === 'welcome' && (
            <button
              onClick={handleWelcomeNext}
              className="bg-neon hover:bg-neon-dim text-void text-sm font-bold px-6 py-2.5 rounded-md transition-colors cursor-pointer"
            >
              Next →
            </button>
          )}
          {step === 'type' && (
            <button
              onClick={handleTypeNext}
              className="bg-neon hover:bg-neon-dim text-void text-sm font-bold px-6 py-2.5 rounded-md transition-colors cursor-pointer"
            >
              Next →
            </button>
          )}
          {step === 'accounts' && (
            <div className="flex items-center gap-4">
              <button
                onClick={handleSkipAccounts}
                className="text-sm text-ash hover:text-chalk transition-colors"
              >
                Skip this step
              </button>
              <button
                onClick={() => void handleAccountsNext()}
                disabled={addingTemplates}
                className="bg-neon hover:bg-neon-dim disabled:opacity-50 text-void text-sm font-bold px-6 py-2.5 rounded-md transition-colors cursor-pointer"
              >
                {addingTemplates ? 'Adding accounts…' : 'Next →'}
              </button>
            </div>
          )}
          {step === 'ready' && <span />}
        </div>
      </div>
    </div>
  )
}
