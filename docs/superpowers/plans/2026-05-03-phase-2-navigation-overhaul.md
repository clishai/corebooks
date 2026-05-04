# Phase 2: Navigation Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the sidebar into collapsible named groups, add a Reports Library with neon-star pinning, animate the settings cog, make the logo navigate home, add a ghost search bar to the toolbar, and add the new welcome message.

**Architecture:** All changes are UI-only. No API or core changes. Pinned-report state and collapsed-section state live in `localStorage`. A new `ReportsLibraryPage` is registered in the router. The sidebar switches from a flat nav list to a `SidebarSection` component that wraps collapsible groups.

**Tech Stack:** React 19, React Router v7, Tailwind v4, CSS transitions (no JS animation library)

---

### Task 1: localStorage helpers for sidebar state

**Files:**
- Create: `src/ui/lib/sidebarState.ts`

- [ ] **Step 1: Write the file**

```typescript
// src/ui/lib/sidebarState.ts

const COLLAPSED_KEY = 'cb_sidebar_collapsed'
const PINNED_KEY = 'cb_pinned_reports'

type SectionId = 'ledger' | 'reports' | 'extra-workflows' | 'plugins'

const DEFAULT_PINNED = ['trial-balance', 'balance-sheet', 'income-statement']

export function getCollapsedSections(): SectionId[] {
  try {
    const raw = localStorage.getItem(COLLAPSED_KEY)
    return raw ? (JSON.parse(raw) as SectionId[]) : []
  } catch {
    return []
  }
}

export function toggleSectionCollapsed(id: SectionId): void {
  const current = getCollapsedSections()
  const next = current.includes(id) ? current.filter((s) => s !== id) : [...current, id]
  localStorage.setItem(COLLAPSED_KEY, JSON.stringify(next))
}

export function isSectionCollapsed(id: SectionId): boolean {
  return getCollapsedSections().includes(id)
}

export function getPinnedReports(): string[] {
  try {
    const raw = localStorage.getItem(PINNED_KEY)
    return raw ? (JSON.parse(raw) as string[]) : [...DEFAULT_PINNED]
  } catch {
    return [...DEFAULT_PINNED]
  }
}

export function setPinnedReports(ids: string[]): void {
  localStorage.setItem(PINNED_KEY, JSON.stringify(ids))
}

export function togglePinnedReport(id: string): void {
  const current = getPinnedReports()
  const next = current.includes(id) ? current.filter((r) => r !== id) : [...current, id]
  setPinnedReports(next)
}

export function isReportPinned(id: string): boolean {
  return getPinnedReports().includes(id)
}
```

- [ ] **Step 2: Commit**

```bash
git add src/ui/lib/sidebarState.ts
git commit -m "feat: add sidebar collapsed/pinned-reports localStorage helpers"
```

---

### Task 2: All available reports registry

**Files:**
- Create: `src/ui/lib/reports.ts`

- [ ] **Step 1: Write the file**

```typescript
// src/ui/lib/reports.ts

export interface ReportMeta {
  id: string
  label: string
  path: string
  description: string
}

export const ALL_REPORTS: ReportMeta[] = [
  {
    id: 'trial-balance',
    label: 'Trial Balance',
    path: '/reports/trial-balance',
    description: 'Sum of all debit and credit balances. Confirms the ledger is balanced.',
  },
  {
    id: 'balance-sheet',
    label: 'Balance Sheet',
    path: '/reports/balance-sheet',
    description: 'Assets, liabilities, and equity as of a specific date.',
  },
  {
    id: 'income-statement',
    label: 'Income Statement',
    path: '/reports/income-statement',
    description: 'Revenue and expenses over a date range. Shows net income.',
  },
]
```

- [ ] **Step 2: Commit**

```bash
git add src/ui/lib/reports.ts
git commit -m "feat: add reports registry"
```

---

### Task 3: Reports Library page

**Files:**
- Create: `src/ui/pages/ReportsLibraryPage.tsx`

- [ ] **Step 1: Write the page**

```typescript
// src/ui/pages/ReportsLibraryPage.tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ALL_REPORTS } from '../lib/reports'
import { isReportPinned, togglePinnedReport } from '../lib/sidebarState'

export default function ReportsLibraryPage() {
  const navigate = useNavigate()
  const [pinned, setPinned] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(ALL_REPORTS.map((r) => [r.id, isReportPinned(r.id)]))
  )

  function handleTogglePin(id: string) {
    togglePinnedReport(id)
    setPinned((prev) => ({ ...prev, [id]: !prev[id] }))
    window.dispatchEvent(new Event('cb:pinned-reports-changed'))
  }

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-chalk font-semibold text-lg mb-1">Reports Library</h1>
      <p className="text-ash text-sm mb-6">
        Pin reports to your sidebar for quick access. Pinned reports appear under the Reports section.
      </p>
      <div className="space-y-2">
        {ALL_REPORTS.map((report) => (
          <div
            key={report.id}
            className="flex items-center justify-between bg-surface border border-rim rounded-sm px-4 py-3"
          >
            <div>
              <button
                onClick={() => navigate(report.path)}
                className="text-chalk font-medium text-sm hover:text-neon transition-colors text-left"
              >
                {report.label}
              </button>
              <p className="text-ash text-xs mt-0.5">{report.description}</p>
            </div>
            <button
              onClick={() => handleTogglePin(report.id)}
              className="ml-4 text-xl leading-none focus:outline-none"
              title={pinned[report.id] ? 'Unpin from sidebar' : 'Pin to sidebar'}
            >
              <span className={`transition-colors ${pinned[report.id] ? 'text-neon star-zap' : 'text-ash'}`}>
                ★
              </span>
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/ui/pages/ReportsLibraryPage.tsx
git commit -m "feat: add Reports Library page with pin toggles"
```

---

### Task 4: CSS animations (cog rotation, star zap, existing page transitions)

**Files:**
- Modify: `src/ui/index.css`

- [ ] **Step 1: Add animation rules**

Open `src/ui/index.css` and append the following after the existing `@keyframes` blocks (after the page-slide keyframes):

```css
/* Settings cog hover animation */
.cog-icon {
  transition: transform 220ms cubic-bezier(0.34, 1.56, 0.64, 1);
}
.settings-link:hover .cog-icon {
  transform: rotate(45deg);
}

/* Settings label slide-in */
.settings-label {
  max-width: 0;
  overflow: hidden;
  opacity: 0;
  transition: max-width 200ms ease, opacity 180ms ease;
  white-space: nowrap;
}
.settings-link:hover .settings-label {
  max-width: 80px;
  opacity: 1;
}

/* Star zap-in animation */
@keyframes star-zap {
  0%   { transform: scale(0); filter: brightness(3); }
  60%  { transform: scale(1.35); filter: brightness(2); }
  100% { transform: scale(1); filter: brightness(1); }
}
.star-zap {
  animation: star-zap 280ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/ui/index.css
git commit -m "feat: add cog rotation, settings label slide, and star zap CSS animations"
```

---

### Task 5: SidebarSection component

**Files:**
- Create: `src/ui/components/SidebarSection.tsx`

- [ ] **Step 1: Write the component**

```typescript
// src/ui/components/SidebarSection.tsx
import { useState } from 'react'
import { isSectionCollapsed, toggleSectionCollapsed } from '../lib/sidebarState'

interface Props {
  id: 'ledger' | 'reports' | 'extra-workflows' | 'plugins'
  label: string
  children: React.ReactNode
}

export default function SidebarSection({ id, label, children }: Props) {
  const [collapsed, setCollapsed] = useState(() => isSectionCollapsed(id))

  function toggle() {
    toggleSectionCollapsed(id)
    setCollapsed((c) => !c)
  }

  return (
    <div className="mb-1">
      <button
        onClick={toggle}
        className="w-full flex items-center justify-between px-3 py-1.5 text-[10px] font-semibold text-ash uppercase tracking-widest hover:text-chalk transition-colors"
      >
        <span>{label}</span>
        <span className={`transition-transform duration-150 ${collapsed ? '-rotate-90' : ''}`}>▾</span>
      </button>
      {!collapsed && <div className="space-y-0.5">{children}</div>}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/ui/components/SidebarSection.tsx
git commit -m "feat: add collapsible SidebarSection component"
```

---

### Task 6: Rebuild Layout.tsx with new sidebar and toolbar

**Files:**
- Modify: `src/ui/components/Layout.tsx`

- [ ] **Step 1: Replace the full file**

```typescript
// src/ui/components/Layout.tsx
import { useState, useRef, useLayoutEffect, useEffect } from 'react'
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom'
import NewEntryModal from './NewEntryModal'
import Toast from './Toast'
import OnboardingWizard, { shouldShowOnboarding, getCompanyName } from './OnboardingWizard'
import SidebarSection from './SidebarSection'
import logoSrc from '../assets/logo.png'
import { getPinnedReports } from '../lib/sidebarState'
import { ALL_REPORTS } from '../lib/reports'

function CogIcon() {
  return (
    <svg
      className="cog-icon"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

const ROUTE_ORDER = [
  '/home',
  '/accounts',
  '/entries',
  '/drafts',
  '/reports/trial-balance',
  '/reports/balance-sheet',
  '/reports/income-statement',
  '/reports/library',
  '/extra/recurring',
  '/extra/close-period',
  '/settings',
]

function getRouteIndex(pathname: string): number {
  return ROUTE_ORDER.findIndex((r) => pathname.startsWith(r))
}

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center px-3 py-2 rounded text-sm font-medium transition-colors ${
    isActive
      ? 'bg-raised text-neon border-l-2 border-neon pl-[10px]'
      : 'text-ash hover:bg-surface hover:text-chalk'
  }`

export default function Layout() {
  const [showNewEntry, setShowNewEntry] = useState(false)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [showWelcome, setShowWelcome] = useState(shouldShowOnboarding)
  const [companyName, setCompanyName] = useState(getCompanyName)
  const [pinnedReports, setPinnedReports] = useState(getPinnedReports)

  const navigate = useNavigate()
  const location = useLocation()
  const prevRouteIndex = useRef(-1)
  const currRouteIndex = getRouteIndex(location.pathname)

  let slideClass = ''
  if (prevRouteIndex.current !== -1 && currRouteIndex !== -1 && prevRouteIndex.current !== currRouteIndex) {
    slideClass = currRouteIndex > prevRouteIndex.current ? 'page-slide-right' : 'page-slide-left'
  }

  useLayoutEffect(() => {
    prevRouteIndex.current = currRouteIndex
  })

  useEffect(() => {
    function handleNameChange() { setCompanyName(getCompanyName()) }
    function handlePinsChange() { setPinnedReports(getPinnedReports()) }
    window.addEventListener('cb:company-name-changed', handleNameChange)
    window.addEventListener('cb:pinned-reports-changed', handlePinsChange)
    return () => {
      window.removeEventListener('cb:company-name-changed', handleNameChange)
      window.removeEventListener('cb:pinned-reports-changed', handlePinsChange)
    }
  }, [])

  function handlePosted() { setShowNewEntry(false) }
  function handleWelcomeDismiss() {
    setShowWelcome(false)
    setCompanyName(getCompanyName())
  }

  const pinnedReportMetas = ALL_REPORTS.filter((r) => pinnedReports.includes(r.id))

  return (
    <div className="flex h-screen bg-base overflow-hidden">
      {/* Sidebar */}
      <aside className="w-52 bg-void flex flex-col shrink-0 border-r border-rim">
        {/* Logo — clicking navigates home */}
        <button
          onClick={() => navigate('/home')}
          className="px-4 py-3 border-b border-rim w-full text-left hover:opacity-80 transition-opacity"
        >
          <img src={logoSrc} alt="corebooks" className="w-full" />
        </button>

        {/* Nav */}
        <nav className="flex-1 py-4 px-2 overflow-y-auto space-y-1">
          {/* Home — standalone */}
          <NavLink to="/home" className={navLinkClass}>
            Home
          </NavLink>

          {/* LEDGER section */}
          <SidebarSection id="ledger" label="Ledger">
            <NavLink to="/accounts" className={navLinkClass}>Chart of Accounts</NavLink>
            <NavLink to="/entries" className={navLinkClass}>Entries</NavLink>
            <NavLink to="/drafts" className={navLinkClass}>Drafts</NavLink>
          </SidebarSection>

          {/* REPORTS section — only pinned */}
          <SidebarSection id="reports" label="Reports">
            {pinnedReportMetas.map((r) => (
              <NavLink key={r.id} to={r.path} className={navLinkClass}>
                {r.label}
              </NavLink>
            ))}
            <NavLink
              to="/reports/library"
              className="flex items-center px-3 py-2 rounded text-xs text-ash hover:text-chalk hover:bg-surface transition-colors"
            >
              Browse all reports...
            </NavLink>
          </SidebarSection>

          {/* EXTRA WORKFLOWS section */}
          <SidebarSection id="extra-workflows" label="Extra Workflows">
            <NavLink to="/extra/recurring" className={navLinkClass}>Recurring</NavLink>
            <NavLink to="/extra/close-period" className={navLinkClass}>Close Period</NavLink>
          </SidebarSection>
        </nav>

        {/* Settings cog — bottom */}
        <div className="border-t border-rim px-2 py-3">
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              `settings-link flex items-center gap-0 px-3 py-2 rounded text-sm font-medium transition-colors overflow-hidden ${
                isActive
                  ? 'bg-raised text-neon border-l-2 border-neon pl-[10px]'
                  : 'text-ash hover:bg-surface hover:text-chalk'
              }`
            }
          >
            <CogIcon />
            <span className="settings-label ml-2.5">Settings</span>
          </NavLink>
        </div>
      </aside>

      {/* Right column */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top toolbar */}
        <header className="h-12 border-b border-rim bg-void flex items-center px-4 gap-3 shrink-0">
          <button
            onClick={() => navigate('/home')}
            className="text-sm font-medium text-chalk hover:text-neon transition-colors truncate max-w-[180px]"
          >
            {companyName || 'corebooks'}
          </button>

          {/* Ghost search bar — shell only, functionality added in Phase 8 */}
          <div className="flex-1 max-w-xs">
            <input
              readOnly
              placeholder="search..."
              onClick={() => {/* command palette — Phase 8 */}}
              className="w-full bg-surface border border-rim rounded-sm px-3 py-1 text-xs text-ash placeholder-ash/50 cursor-pointer focus:outline-none"
            />
          </div>

          <div className="ml-auto">
            <button
              onClick={() => setShowNewEntry(true)}
              className="bg-neon hover:bg-neon-dim text-void text-xs font-semibold px-3 py-1.5 rounded-sm transition-colors"
            >
              + New Entry
            </button>
          </div>
        </header>

        {/* Page content */}
        <main key={location.key} className={`flex-1 overflow-auto ${slideClass}`}>
          <Outlet />
        </main>
      </div>

      {showNewEntry && (
        <NewEntryModal
          onClose={() => {
            setShowNewEntry(false)
            setToastMessage('Draft saved')
          }}
          onPosted={handlePosted}
        />
      )}
      {toastMessage && (
        <Toast message={toastMessage} onDone={() => setToastMessage(null)} />
      )}
      {showWelcome && <OnboardingWizard onDismiss={handleWelcomeDismiss} />}
    </div>
  )
}
```

- [ ] **Step 2: Type check**

```bash
npx tsc --project src/ui/tsconfig.json --noEmit
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/ui/components/Layout.tsx
git commit -m "feat: rebuild sidebar with collapsible sections, cog animation, logo→home"
```

---

### Task 7: Register ReportsLibraryPage and new routes in router

**Files:**
- Modify: `src/ui/main.tsx` (or wherever the React Router routes are defined — check with `grep -r "createBrowserRouter\|RouterProvider\|Routes" src/ui/ --include="*.tsx" -l`)

- [ ] **Step 1: Find the router file**

```bash
grep -r "createBrowserRouter\|RouterProvider\|<Routes" src/ui/ --include="*.tsx" -l
```

- [ ] **Step 2: Add ReportsLibraryPage import and route**

In the router file, add:
```typescript
import ReportsLibraryPage from './pages/ReportsLibraryPage'
```

And add the route inside the Layout wrapper:
```typescript
{ path: 'reports/library', element: <ReportsLibraryPage /> },
```

Also add placeholder routes for future phases (prevents 404 on nav clicks):
```typescript
{ path: 'extra/recurring', element: <div className="p-6 text-ash text-sm">Recurring transactions — coming in Phase 3.</div> },
{ path: 'extra/close-period', element: <div className="p-6 text-ash text-sm">Close Period — coming in Phase 4.</div> },
```

- [ ] **Step 3: Type check**

```bash
npx tsc --project src/ui/tsconfig.json --noEmit
```
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/ui/main.tsx  # or the actual router file found in Step 1
git commit -m "feat: register Reports Library and placeholder routes"
```

---

### Task 8: Add new welcome message to HomePage

**Files:**
- Modify: `src/ui/pages/HomePage.tsx`

- [ ] **Step 1: Find the welcome messages array**

```bash
grep -n "welcome\|message\|random\|Math.floor" src/ui/pages/HomePage.tsx | head -20
```

- [ ] **Step 2: Add the new message**

Find the array of welcome messages in `HomePage.tsx` and add `"we are the minecraft of accounting."` as an additional entry. The array likely looks like:

```typescript
const MESSAGES = [
  "welcome back.",
  // ... existing messages
  "we are the minecraft of accounting.",  // ADD THIS
]
```

- [ ] **Step 3: Type check**

```bash
npx tsc --project src/ui/tsconfig.json --noEmit
```
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/ui/pages/HomePage.tsx
git commit -m "feat: add minecraft welcome message to home page"
```

---

### Task 9: Smoke-test the UI

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

- [ ] **Step 2: Manual checklist**
  - [ ] Sidebar shows: Home (standalone), LEDGER (collapsible), REPORTS (collapsible, 3 pinned), EXTRA WORKFLOWS (collapsible), Settings cog at bottom
  - [ ] Clicking each section header collapses/expands it
  - [ ] Hovering the settings cog: rotates 45°, "Settings" slides in; moving away reverses
  - [ ] Clicking the logo navigates to /home
  - [ ] Clicking business name in toolbar navigates to /home
  - [ ] Ghost search bar visible in toolbar (read-only, no functionality yet)
  - [ ] "Browse all reports..." opens /reports/library
  - [ ] Reports Library shows all 3 reports with star toggles
  - [ ] Clicking a star turns it neon blue with zap animation; clicking again turns it ash
  - [ ] Unpinning a report removes it from the REPORTS section after refresh
  - [ ] /extra/recurring and /extra/close-period show placeholder text
  - [ ] + New Entry button opens entry modal

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "chore: phase 2 navigation overhaul complete"
```
