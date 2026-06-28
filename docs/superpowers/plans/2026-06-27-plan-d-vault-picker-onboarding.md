# Plan D — Vault Picker & Onboarding Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the Vault Picker (wordmark, keyboard navigation, lock badge, 30-day skip) and the Onboarding Wizard (4 steps, 6-type grid, pre-selected templates, Ready step) per the sandbox UX spec sections 5 and 6.

**Architecture:** Four self-contained changes. The OnboardingWizard is a full replacement of the existing component. The skip-picker feature adds two methods to VaultManager, two IPC handlers in main.ts, and two preload methods; the startup sequence in main.ts checks the skip preference and auto-selects the last vault before opening the window so the picker page is never rendered. VaultPickerPage is a full replacement of the existing component using the new IPC.

**Tech Stack:** TypeScript strict, React 19, Tailwind v4, Vitest, Electron IPC, react-router-dom.

---

## File Map

| File | Status | Responsibility |
|------|--------|----------------|
| `src/ui/components/OnboardingWizard.tsx` | **Replace** | 4-step wizard: welcome, business-type grid, pre-selected accounts, ready |
| `src/electron/vaultTypes.ts` | **Modify** | Add `skipPickerUntil?: string` to `VaultRegistry` |
| `src/electron/vaultManager.ts` | **Modify** | Add `getSkipPickerUntil()` and `setSkipPickerUntil()` |
| `src/electron/main.ts` | **Modify** | Auto-select vault on startup when skip active; new IPC handlers; clear skip on relaunch |
| `src/electron/preload.ts` | **Modify** | Expose `setSkipUntil` and `getSkipUntil` to renderer |
| `src/ui/electron.d.ts` | **Modify** | Type declarations for new vault IPC methods |
| `src/ui/pages/VaultPickerPage.tsx` | **Replace** | Wordmark, keyboard nav, lock badge, skip checkbox |
| `tests/electron/vaultManager.skip.test.ts` | **Create** | Unit tests for skip methods |

---

## Task 1: Redesign `OnboardingWizard.tsx`

**Files:**
- Replace: `src/ui/components/OnboardingWizard.tsx`

The wizard gains a 4th step ("Ready"), 6 business types in a 2-column grid, templates that start fully pre-selected (user unticks to remove), and a footer note about Settings → Features on the final step.

- [ ] **Step 1: Read the current file**

```bash
cat src/ui/components/OnboardingWizard.tsx
```

Verify the current exports that must be preserved: `shouldShowOnboarding`, `getCompanyName`, `COMPANY_NAME_KEY`, and the default export `OnboardingWizard`.

- [ ] **Step 2: Replace `src/ui/components/OnboardingWizard.tsx` with the redesigned version**

```typescript
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  type BusinessType,
  saveBusinessType,
  saveFeatureFlags,
} from '../lib/featureFlags'
import { getTemplatesForBusinessType, type AccountTemplate } from '../lib/accountTemplates'
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
```

- [ ] **Step 3: TypeScript check**

```bash
npx tsc --project src/ui/tsconfig.json --noEmit
```

Expected: 0 errors.

- [ ] **Step 4: Run full test suite**

```bash
npx vitest run
```

Expected: all tests passing (no regressions — OnboardingWizard has no unit tests; only TypeScript correctness matters here).

- [ ] **Step 5: Commit**

```bash
git add src/ui/components/OnboardingWizard.tsx
git commit -m "feat: redesign onboarding wizard with 4 steps, grid business types, pre-selected templates"
```

---

## Task 2: Add skip-picker infrastructure to VaultManager

**Files:**
- Modify: `src/electron/vaultTypes.ts`
- Modify: `src/electron/vaultManager.ts`
- Create: `tests/electron/vaultManager.skip.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/electron/vaultManager.skip.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { VaultManager } from '../../src/electron/vaultManager.js'

let tmpDir: string
let manager: VaultManager

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-skip-test-'))
  manager = new VaultManager(tmpDir)
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('getSkipPickerUntil', () => {
  it('returns null when no registry exists', () => {
    expect(manager.getSkipPickerUntil()).toBeNull()
  })

  it('returns null when registry has no skipPickerUntil', () => {
    fs.writeFileSync(path.join(tmpDir, 'vaults.json'), JSON.stringify({ vaults: [] }))
    expect(manager.getSkipPickerUntil()).toBeNull()
  })

  it('returns the stored date after setSkipPickerUntil', () => {
    const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    manager.setSkipPickerUntil(future)
    expect(manager.getSkipPickerUntil()).toBe(future)
  })
})

describe('setSkipPickerUntil', () => {
  it('persists the skip date to the registry file', () => {
    const future = new Date(Date.now() + 86400000).toISOString()
    manager.setSkipPickerUntil(future)
    const raw = JSON.parse(fs.readFileSync(path.join(tmpDir, 'vaults.json'), 'utf-8'))
    expect(raw.skipPickerUntil).toBe(future)
  })

  it('removes skipPickerUntil from the file when passed null', () => {
    manager.setSkipPickerUntil(new Date(Date.now() + 1000).toISOString())
    manager.setSkipPickerUntil(null)
    const raw = JSON.parse(fs.readFileSync(path.join(tmpDir, 'vaults.json'), 'utf-8'))
    expect(raw.skipPickerUntil).toBeUndefined()
    expect(manager.getSkipPickerUntil()).toBeNull()
  })

  it('preserves existing vaults array when setting skip', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'vaults.json'),
      JSON.stringify({ vaults: [{ path: '/some/vault', name: 'Test', lastOpened: '2024-01-01T00:00:00Z' }] }),
    )
    manager.setSkipPickerUntil(new Date(Date.now() + 1000).toISOString())
    const raw = JSON.parse(fs.readFileSync(path.join(tmpDir, 'vaults.json'), 'utf-8'))
    expect(raw.vaults).toHaveLength(1)
    expect(raw.vaults[0].path).toBe('/some/vault')
  })

  it('round-trips correctly through get', () => {
    const date = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    manager.setSkipPickerUntil(date)
    expect(manager.getSkipPickerUntil()).toBe(date)
    manager.setSkipPickerUntil(null)
    expect(manager.getSkipPickerUntil()).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
npx vitest run tests/electron/vaultManager.skip.test.ts
```

Expected: FAIL — `getSkipPickerUntil is not a function` (methods don't exist yet).

- [ ] **Step 3: Add `skipPickerUntil` to `VaultRegistry` in `vaultTypes.ts`**

Find this interface in `src/electron/vaultTypes.ts`:

```typescript
export interface VaultRegistry {
  vaults: VaultEntry[]
}
```

Replace with:

```typescript
export interface VaultRegistry {
  vaults: VaultEntry[]
  skipPickerUntil?: string // ISO 8601 — if in future, auto-open last vault on startup
}
```

- [ ] **Step 4: Add `getSkipPickerUntil` and `setSkipPickerUntil` to `VaultManager`**

In `src/electron/vaultManager.ts`, find the `removeFromRegistry` method (the last method in the class) and add the two new methods immediately after it, before the closing `}` of the class:

```typescript
  getSkipPickerUntil(): string | null {
    return this.readRegistry().skipPickerUntil ?? null
  }

  setSkipPickerUntil(until: string | null): void {
    const registry = this.readRegistry()
    if (until === null) {
      delete registry.skipPickerUntil
    } else {
      registry.skipPickerUntil = until
    }
    this.writeRegistry(registry)
  }
```

- [ ] **Step 5: Run tests — expect PASS**

```bash
npx vitest run tests/electron/vaultManager.skip.test.ts
```

Expected: 5 tests, all passing.

- [ ] **Step 6: Run full suite**

```bash
npx vitest run
```

Expected: all tests passing.

- [ ] **Step 7: TypeScript check (server side)**

```bash
npm run build 2>&1 | grep -i error | head -20
```

Expected: no TypeScript errors in the electron/api layers.

- [ ] **Step 8: Commit**

```bash
git add src/electron/vaultTypes.ts src/electron/vaultManager.ts tests/electron/vaultManager.skip.test.ts
git commit -m "feat: add skip-picker infrastructure to VaultManager"
```

---

## Task 3: Wire skip into Electron (`main.ts`, `preload.ts`, `electron.d.ts`)

**Files:**
- Modify: `src/electron/main.ts`
- Modify: `src/electron/preload.ts`
- Modify: `src/ui/electron.d.ts`

Three changes:
1. In `main.ts`: add two IPC handlers (`vault:setSkipUntil`, `vault:getSkipUntil`); modify `vault:relaunch` to clear the skip before relaunching; add auto-select logic before `createWindow()`.
2. In `preload.ts`: expose the two new IPC methods.
3. In `electron.d.ts`: declare the two new methods on `window.electronAPI.vault`.

- [ ] **Step 1: Read `src/electron/main.ts`**

Look for:
- The `registerIpc()` function — you need to add to it and modify `vault:relaunch`
- The `app.whenReady().then(...)` block — you need to add auto-select logic before `await createWindow()`

- [ ] **Step 2: Modify `registerIpc()` in `main.ts` — add new IPC handlers**

Inside `registerIpc()`, find the existing `vault:relaunch` handler:

```typescript
  ipcMain.handle('vault:relaunch', () => {
    app.relaunch()
    app.exit(0)
  })
```

Replace it with:

```typescript
  ipcMain.handle('vault:relaunch', () => {
    vaultManager.setSkipPickerUntil(null)
    app.relaunch()
    app.exit(0)
  })

  ipcMain.handle('vault:setSkipUntil', (_event, until: string | null) => {
    vaultManager.setSkipPickerUntil(until)
  })

  ipcMain.handle('vault:getSkipUntil', () => {
    return vaultManager.getSkipPickerUntil()
  })
```

- [ ] **Step 3: Add auto-select logic to `app.whenReady()` in `main.ts`**

Find the `app.whenReady().then(async () => {` block. The current body is:

```typescript
  const userData = app.getPath('userData')
  vaultManager = new VaultManager(userData)

  registerIpc()
  await createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow()
    }
  })
```

Replace with:

```typescript
  const userData = app.getPath('userData')
  vaultManager = new VaultManager(userData)

  registerIpc()

  // If the user requested "skip picker for 30 days", auto-select the last vault
  // before creating the window. This means the preload's sendSync('vault:getState')
  // will see a non-null apiPort, so VaultGate renders the app directly.
  const skipUntil = vaultManager.getSkipPickerUntil()
  if (skipUntil && new Date(skipUntil) > new Date()) {
    const knownVaults = vaultManager.list()
    if (knownVaults.length > 0) {
      try {
        vaultManager.select(knownVaults[0].path)
        currentApiPort = await startApiForVault(knownVaults[0].path)
      } catch {
        // Vault unavailable (moved or deleted) — fall through to show picker
        currentApiPort = null
      }
    }
  }

  await createWindow()

  // If a vault was auto-selected above, mainWindow now exists but the file
  // watcher was not started (mainWindow was null during startApiForVault).
  // Start it now.
  if (currentApiPort !== null && vaultManager.getCurrent() && mainWindow) {
    vaultWatcher.start(vaultManager.getCurrent()!.path, mainWindow)
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow()
    }
  })
```

- [ ] **Step 4: Expose new methods in `src/electron/preload.ts`**

Find the `vault` section in the `contextBridge.exposeInMainWorld` call. Find the last method in the vault object:

```typescript
    safeStorageAvailable: () => ipcRenderer.invoke('vault:safeStorageAvailable'),
```

Add immediately after it (before the closing `},` of the vault object):

```typescript
    setSkipUntil: (until: string | null) => ipcRenderer.invoke('vault:setSkipUntil', until),
    getSkipUntil: () => ipcRenderer.invoke('vault:getSkipUntil'),
```

- [ ] **Step 5: Add type declarations to `src/ui/electron.d.ts`**

Find the vault interface in the `Window` declaration. Find the last method:

```typescript
        safeStorageAvailable: () => Promise<boolean>
```

Add immediately after it (before the closing `}` of the vault object):

```typescript
        setSkipUntil: (until: string | null) => Promise<void>
        getSkipUntil: () => Promise<string | null>
```

- [ ] **Step 6: TypeScript check (both sides)**

```bash
npm run build 2>&1 | grep -i error | head -20
npx tsc --project src/ui/tsconfig.json --noEmit
```

Expected: 0 errors on both.

- [ ] **Step 7: Run full test suite**

```bash
npx vitest run
```

Expected: all tests passing.

- [ ] **Step 8: Commit**

```bash
git add src/electron/main.ts src/electron/preload.ts src/ui/electron.d.ts
git commit -m "feat: wire skip-picker into Electron startup, preload, and type declarations"
```

---

## Task 4: Redesign `VaultPickerPage.tsx`

**Files:**
- Replace: `src/ui/pages/VaultPickerPage.tsx`

Visual and UX overhaul: `~/ corebooks` styled wordmark instead of the PNG logo, keyboard navigation (↑↓ to move selection, Enter or double-click to open), neon-border selection highlight, "open" lock badge on each vault card, and a "Don't show this screen for 30 days" checkbox at the bottom.

The `logoSrc` import from `'../assets/logo.png'` is removed. No other files need to change.

- [ ] **Step 1: Replace `src/ui/pages/VaultPickerPage.tsx`**

```typescript
import { useState, useEffect, useCallback } from 'react'
import type { VaultEntry } from '../../electron/vaultTypes'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export default function VaultPickerPage() {
  const [vaults, setVaults] = useState<VaultEntry[]>([])
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDir, setNewDir] = useState('')
  const [creating, setCreating] = useState(false)
  const [opening, setOpening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [skipFor30Days, setSkipFor30Days] = useState(false)

  useEffect(() => {
    window.electronAPI?.vault.list().then((list) => {
      setVaults(list)
      if (list.length > 0) setSelectedPath(list[0].path)
    }).catch(() => setVaults([]))
  }, [])

  useEffect(() => {
    const unsubscribe = window.electronAPI?.vault.onReady(() => {
      window.location.reload()
    })
    return () => { unsubscribe?.() }
  }, [])

  const openVault = useCallback(async (vaultPath: string) => {
    setError(null)
    try {
      if (skipFor30Days) {
        await window.electronAPI?.vault.setSkipUntil(
          new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        )
      }
      await window.electronAPI?.vault.select(vaultPath)
      // vault:ready fires → onReady callback → window.location.reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to open vault')
    }
  }, [skipFor30Days])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (showNew) return
      if (vaults.length === 0) return
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedPath((prev) => {
          const idx = prev ? vaults.findIndex((v) => v.path === prev) : -1
          return vaults[(idx + 1) % vaults.length].path
        })
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedPath((prev) => {
          const idx = prev ? vaults.findIndex((v) => v.path === prev) : 0
          return vaults[(idx - 1 + vaults.length) % vaults.length].path
        })
      } else if (e.key === 'Enter' && selectedPath) {
        void openVault(selectedPath)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [vaults, selectedPath, showNew, openVault])

  async function handleCreate() {
    if (!newName.trim() || !newDir.trim()) return
    setCreating(true)
    setError(null)
    try {
      if (skipFor30Days) {
        await window.electronAPI?.vault.setSkipUntil(
          new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        )
      }
      await window.electronAPI?.vault.create(newName.trim(), newDir.trim())
      // vault:ready fires → onReady callback → window.location.reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create vault')
      setCreating(false)
    }
  }

  async function handleChooseDir() {
    const dir = await window.electronAPI?.vault.chooseDirectory()
    if (dir) setNewDir(dir)
  }

  async function handleOpenExisting() {
    setOpening(true)
    setError(null)
    try {
      const dir = await window.electronAPI?.vault.chooseDirectory()
      if (!dir) { setOpening(false); return }
      if (skipFor30Days) {
        await window.electronAPI?.vault.setSkipUntil(
          new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        )
      }
      await window.electronAPI?.vault.select(dir)
      // vault:ready fires → onReady callback → window.location.reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to open vault')
      setOpening(false)
    }
  }

  return (
    <div className="min-h-screen bg-base flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-2xl">

        {/* Wordmark */}
        <div className="flex justify-center mb-10">
          <span className="font-mono font-light text-chalk text-2xl tracking-tight">~/ corebooks</span>
        </div>

        <h1 className="text-xl font-semibold text-chalk text-center mb-2">Open a vault</h1>
        <p className="text-sm text-ash text-center mb-8">
          Each vault is a folder on your machine containing a set of books.
        </p>

        {error && (
          <div className="mb-6 text-sm text-red-300 bg-red-950/50 border border-red-800 px-4 py-3 rounded-md">
            {error}
          </div>
        )}

        {/* Existing vaults */}
        {vaults.length > 0 && (
          <div className="grid gap-2 mb-6">
            {vaults.map((vault) => {
              const isSelected = selectedPath === vault.path
              return (
                <button
                  key={vault.path}
                  onClick={() => setSelectedPath(vault.path)}
                  onDoubleClick={() => void openVault(vault.path)}
                  className={`w-full text-left border rounded-lg px-5 py-4 transition-colors cursor-pointer group ${
                    isSelected
                      ? 'border-neon bg-neon/5'
                      : 'border-rim bg-surface hover:border-neon/40 hover:bg-raised'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-base font-semibold transition-colors ${isSelected ? 'text-neon' : 'text-chalk group-hover:text-neon'}`}>
                      {vault.name}
                    </span>
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] text-ash border border-rim rounded px-1.5 py-0.5 uppercase tracking-wider">
                        open
                      </span>
                      <span className="text-xs text-ash">
                        Last opened {formatDate(vault.lastOpened)}
                      </span>
                    </div>
                  </div>
                  <div className="text-xs text-ash mt-1 truncate font-mono">{vault.path}</div>
                </button>
              )
            })}
          </div>
        )}

        {/* New vault form */}
        {showNew ? (
          <div className="bg-surface border border-rim rounded-xl px-5 py-5 mb-4">
            <h2 className="text-sm font-semibold text-chalk mb-4">Create a new vault</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-chalk mb-1.5">Vault name</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="My Business"
                  className="w-full bg-base border border-rim rounded-md px-3 py-2 text-sm text-chalk placeholder:text-ash focus:outline-none focus:border-neon transition-colors"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === 'Enter') void handleCreate() }}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-chalk mb-1.5">Location</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newDir}
                    onChange={(e) => setNewDir(e.target.value)}
                    placeholder="/Users/you/Documents"
                    className="flex-1 bg-base border border-rim rounded-md px-3 py-2 text-sm text-chalk placeholder:text-ash focus:outline-none focus:border-neon transition-colors"
                  />
                  <button
                    onClick={() => void handleChooseDir()}
                    className="px-3 py-2 bg-raised border border-rim rounded-md text-xs text-ash hover:text-chalk hover:border-neon/50 transition-colors cursor-pointer"
                  >
                    Browse…
                  </button>
                </div>
              </div>
              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => void handleCreate()}
                  disabled={!newName.trim() || !newDir.trim() || creating}
                  className="flex-1 bg-neon hover:bg-neon-dim text-void text-sm font-bold py-2 rounded-md transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {creating ? 'Creating…' : 'Create vault'}
                </button>
                <button
                  onClick={() => { setShowNew(false); setNewName(''); setNewDir('') }}
                  className="px-4 py-2 bg-raised border border-rim rounded-md text-sm text-ash hover:text-chalk hover:border-neon/50 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex gap-3">
            <button
              onClick={() => setShowNew(true)}
              className="flex-1 bg-neon hover:bg-neon-dim text-void text-sm font-bold py-2.5 rounded-md transition-colors cursor-pointer"
            >
              + New vault
            </button>
            <button
              onClick={() => void handleOpenExisting()}
              disabled={opening}
              className="flex-1 bg-surface border border-rim hover:border-neon/50 text-chalk text-sm font-medium py-2.5 rounded-md transition-colors cursor-pointer disabled:opacity-40"
            >
              {opening ? 'Opening…' : 'Open existing…'}
            </button>
          </div>
        )}

        {/* Skip preference — only shown when there are vaults to skip to */}
        {vaults.length > 0 && (
          <div className="flex items-center gap-2 mt-6 justify-center">
            <input
              type="checkbox"
              id="skip-30-days"
              checked={skipFor30Days}
              onChange={(e) => setSkipFor30Days(e.target.checked)}
              className="rounded border-rim accent-neon cursor-pointer"
            />
            <label htmlFor="skip-30-days" className="text-xs text-ash cursor-pointer select-none">
              Don&apos;t show this screen for 30 days
            </label>
          </div>
        )}

        {/* Keyboard hint */}
        {vaults.length > 0 && (
          <p className="text-[11px] text-ash/40 text-center mt-3">
            ↑↓ navigate · Enter or double-click to open
          </p>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --project src/ui/tsconfig.json --noEmit
```

Expected: 0 errors. If there is an error about `logoSrc` being unused, it is gone — the import was removed entirely. If TypeScript flags `setSkipUntil` as not existing on `window.electronAPI.vault`, that means Task 3 was not completed first. Complete Task 3 before this task.

- [ ] **Step 3: Run full test suite**

```bash
npx vitest run
```

Expected: all tests passing.

- [ ] **Step 4: Commit**

```bash
git add src/ui/pages/VaultPickerPage.tsx
git commit -m "feat: redesign vault picker with wordmark, keyboard nav, lock badge, and 30-day skip"
```

---

## Spec Self-Review

**1. Spec coverage (against `docs/superpowers/specs/2026-06-25-sandbox-ux-design.md` sections 5 and 6)**

| Requirement | Task |
|---|---|
| Onboarding: 4 steps | Task 1 |
| Step 1: vault name field, one-liner | Task 1 |
| Step 2: 6 types in grid layout | Task 1 |
| Step 3: templates all pre-selected, individually toggleable | Task 1 |
| Step 3: "Skip this step" available | Task 1 |
| Step 3: note about Account Library | Task 1 |
| Step 4: 3 neutral action choices | Task 1 |
| Step 4: footer note about Settings → Features | Task 1 |
| Vault picker: `~/ corebooks` wordmark | Task 4 |
| Vault picker: vault list with name, path, last opened, lock badge | Task 4 |
| Vault picker: selected vault highlighted | Task 4 |
| Vault picker: double-click or Enter to open | Task 4 |
| Vault picker: `+ New vault` and `Open existing…` buttons | Task 4 |
| Vault picker: "Don't show for 30 days" checkbox | Tasks 2+3+4 |
| Skip stored outside vault (in `userData/vaults.json`) | Tasks 2+3 |
| Skip cleared when relaunching for vault picker | Task 3 |
| `/go vault-picker` always works regardless of skip | Task 3 (`vault:relaunch` clears skip before relaunch; the `/go vault-picker` slash command calls `vault.relaunch()`) |

**Out of scope for Plan D (future plans):**
- Vault password / lock badge "protected" state (Plan E — encryption not yet implemented)
- Onboarding step 3 "Note: More accounts available in Account Library" pointing to a specific flow
- The Account Library drawer integration from Step 4's "Browse the account library" action (currently navigates to `/accounts`; the drawer opens from there)

**2. Placeholder scan** — no TBDs or incomplete steps. All code is provided in full.

**3. Type consistency**
- `BusinessTypeUI` defined and used only in Task 1.
- `BUSINESS_TYPE_MAP` maps every `BusinessTypeUI` value to a `BusinessType` value from `featureFlags.ts`. No new `BusinessType` values needed.
- `getSkipPickerUntil()` returns `string | null` in Task 2; `vault:getSkipUntil` IPC returns same in Task 3; `electron.d.ts` declares `Promise<string | null>` in Task 3; `openVault` uses `vault.setSkipUntil(string)` in Task 4.
- `addSelectedAccounts()` in Task 1 does not return a value (returns `Promise<void>`) — `handleAccountsNext` awaits it correctly.
