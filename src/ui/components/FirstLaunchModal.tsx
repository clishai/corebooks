import { useState } from 'react'

const STORAGE_KEY = 'cb_welcomed'
export const COMPANY_NAME_KEY = 'cb_company_name'

export function shouldShowFirstLaunch(): boolean {
  return !localStorage.getItem(STORAGE_KEY)
}

export function getCompanyName(): string {
  return localStorage.getItem(COMPANY_NAME_KEY) ?? 'corebooks'
}

interface Props {
  onDismiss: () => void
}

export default function FirstLaunchModal({ onDismiss }: Props) {
  const [companyName, setCompanyName] = useState('')

  function handleDismiss() {
    const name = companyName.trim()
    if (name) {
      localStorage.setItem(COMPANY_NAME_KEY, name)
    }
    localStorage.setItem(STORAGE_KEY, '1')
    onDismiss()
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-surface border border-rim rounded-xl shadow-2xl w-full max-w-lg">
        {/* Header */}
        <div className="px-7 pt-7 pb-5">
          <h2 className="text-lg font-bold text-chalk lowercase mb-5">welcome to corebooks</h2>

          <div className="space-y-4 text-sm text-ash leading-relaxed">
            <div className="bg-raised border border-rim rounded-lg px-4 py-4 space-y-2">
              <label className="block font-medium text-chalk" htmlFor="company-name">
                What's your company name?
              </label>
              <input
                id="company-name"
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleDismiss() }}
                placeholder="e.g. Acme Corp"
                className="w-full bg-base border border-rim rounded-md px-3 py-2 text-chalk placeholder:text-ash focus:outline-none focus:border-neon text-sm"
                autoFocus
              />
              <p className="text-xs text-ash">
                This appears in the top bar. You can change it later in Settings.
              </p>
            </div>

            <p>
              Your financial data is stored{' '}
              <strong className="text-chalk">right here on your computer</strong>. No cloud, no
              subscription, no account required. Everything lives in a single file — you own it
              completely.
            </p>

            <div className="bg-raised border border-rim rounded-lg px-4 py-3 space-y-2">
              <p className="font-medium text-chalk">Just you, or a small team on one computer?</p>
              <p>
                You&apos;re all set. corebooks uses a lightweight local database that requires
                zero setup. Start adding accounts and entries right now.
              </p>
            </div>

            <div className="bg-raised border border-rim rounded-lg px-4 py-3 space-y-2">
              <p className="font-medium text-chalk">Multiple employees on different computers?</p>
              <p>
                You can connect corebooks to a shared database so your whole team sees the same
                data. A step-by-step setup guide is available in{' '}
                <strong className="text-chalk">Settings → Database</strong> when you&apos;re ready.
                There&apos;s no rush — the local setup works fine to start.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-7 pb-7 flex justify-end">
          <button
            onClick={handleDismiss}
            className="bg-neon hover:bg-neon-dim text-void text-sm font-bold px-6 py-2.5 rounded-md transition-colors"
          >
            Get started
          </button>
        </div>
      </div>
    </div>
  )
}
