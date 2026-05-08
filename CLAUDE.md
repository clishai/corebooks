# CoreBooks — Claude Code Instructions

## What This Project Is

CoreBooks is an open-source, self-hosted, privacy-first accounting application built in TypeScript. It follows Onion Architecture — the innermost layer is a pure double-entry accounting engine with zero external dependencies. Each outer layer adds functionality without ever modifying the core.

Explaining the "why" behind your decisions is as important as the working code itself. Never make a change without explaining what it does and why.

## Architecture

```
src/
  core/         ← Layer 1: Pure accounting engine. Zero external dependencies.
    types/      ← Interfaces and type definitions
    engine/     ← Business logic functions
    validation/ ← Accounting rules and constraints
  db/           ← Layer 2: Prisma + SQLite/PostgreSQL
  api/          ← Layer 3: Fastify REST API
  ui/           ← Layer 4: React + Tailwind frontend
  electron/     ← Layer 5: Electron desktop wrapper
tests/
  core/         ← Unit tests for the accounting engine
```

### Vault Structure (Phase 10 — in progress)

A vault is a user-owned folder that contains one company's books. Multiple vaults can exist on the same machine (one per company, project, or client). The app always asks which vault to open on launch.

```
~/Documents/My Business/     ← vault root (user-named, user-movable)
  .corebooks                 ← JSON metadata: name, version, created
  corebooks.db               ← SQLite database for this vault
  imports/                   ← drop files here to trigger import (future)
  statements/                ← archived bank statements (future)
  receipts/                  ← receipts linked to entries (future)
  exports/                   ← app-generated report files (future)
```

Vault registry lives at `userData/vaults.json` (the only file outside any vault). Encryption keys stay in `userData/.db.key` — never in the vault folder, so vaults are portable and shareable without exposing key material.

## Stack

- TypeScript strict mode, Node.js runtime
- Database: SQLite via Prisma 7 + `@prisma/adapter-better-sqlite3` (default); PostgreSQL opt-in
- Frontend: React 19 + Vite 8 + Tailwind v4 (`src/ui/`)
- API: Fastify 5 + @fastify/sensible (`src/api/`)
- Testing: Vitest, Package manager: npm
- Desktop: Electron (.dmg / .exe / .AppImage)

## Dev Commands

- `npm run dev` — starts both servers; color-labeled (`api` cyan, `ui` magenta); either crash kills both
- `npm run dev:api` / `npm run dev:ui` — individual servers
- `npm run build:all` — TypeScript + Vite → `dist/`
- `npm run package` — platform installer → `release/`
- Both servers bind to `127.0.0.1` only. `GET /health` is the liveness endpoint (no DB access).

---

## Completed Phases

### Phases 1–5 (complete)

Key decisions to carry forward:

- **Core engine** (`src/core`): explicit stateful `Ledger` object; `balanceSheet` takes `asOf`, `incomeStatement` takes `from`/`to`; both replay `postedEntries` rather than the live balance map. `reverseEntry` blocks reversing a reversal. 104 tests passing.
- **DB layer**: Amounts stored as Int cents. `src/db/mappers.ts` is the sole cent↔dollar boundary — core never sees cents, DB never sees floats.
- **API**: Fastify 5. No accounting logic in routes — routes delegate to repositories. All routes in `src/api/routes/`.
- **UI**: React 19 + Tailwind v4. JetBrains Mono, cypherpunk dark theme, 220 ms page-slide transitions. `p-6` on `<main>` wrapper in `Layout.tsx` provides consistent page padding — page components must not add redundant outer padding.
- **Electron**: dynamically assigned port injected via `window.electronAPI.apiBaseUrl`. SQLite at `app.getPath('userData')`. API started via `src/api/bootstrap.ts`. `localhost:3000` never hardcoded.
- **Account classification**: `classification: 'current' | 'non-current'` on `Account`. `BalanceSheet` response has section breakdowns (`currentAssets`, `nonCurrentAssets`, `currentLiabilities`, `nonCurrentLiabilities`). `IncomeStatement` has `revenueLines` / `expenseLines`.
- **Onboarding**: `src/ui/components/OnboardingWizard.tsx` (3-step modal: company name, business type, template suggestions). Replaces deleted `FirstLaunchModal.tsx`. `shouldShowOnboarding` and `getCompanyName` exported from `OnboardingWizard`.
- **Feature flags**: `src/ui/lib/featureFlags.ts` — `cb_flags` in localStorage, `ar_ap` and `inventory` booleans. Gate new module sidebar items behind `isFeatureEnabled('ar_ap')` / `isFeatureEnabled('inventory')`.
- **Payment methods**: `src/ui/lib/paymentMethods.ts` — `cb_payment_methods` in localStorage, default list. `NewEntryModal` uses a `<select>` from this list (not free text). Settings → Payment Methods tab manages the list.
- **Security**: API loopback-only; PostgreSQL SSL warning; encrypted export (AES-256-GCM + PBKDF2 600k iterations) via `src/ui/lib/crypto.ts`; `safeStorage` key infrastructure in `src/electron/main.ts` ready for SQLCipher.

### Phase 6 — Keyboard Shortcuts (complete)

- `src/ui/lib/shortcuts.ts` — `ShortcutBinding`, `DEFAULT_SHORTCUTS`, `SHORTCUT_LABELS`, localStorage key `cb_shortcuts`. Helpers: `getShortcuts`, `saveShortcuts`, `formatBinding`, `bindingsMatch`, `findConflict`.
- `src/ui/hooks/useKeyboardShortcuts.ts` — global `keydown` listener; skips inputs unless key is Escape or uses Cmd/Ctrl.
- `src/ui/components/ShortcutRecorder.tsx` — click-to-record; amber border on conflict.
- Settings → **Shortcuts** tab: live rebinding with inline conflict detection.
- `Layout.tsx` wires shortcuts: `new-entry`, `go-home`, `go-entries`, `go-accounts`, `go-drafts`, `go-recurring`, `go-close-period`, `global-search`.

### Phase 7 — Account Template Library (complete)

- `src/ui/lib/accountTemplates.ts` — 42 common accounts with type, normalBalance, classification, isContra, description, and businessTypes filter. `getTemplatesForBusinessType(type)` narrows results.
- `src/ui/components/AccountLibraryDrawer.tsx` — slide-in drawer grouped by account type; "Add All" per group; ADD+ buttons; already-added accounts show "Added".
- `AccountsPage` — **Browse Library** button opens the drawer.
- `OnboardingWizard` Step 3 — shows up to 12 suggested templates for the chosen business type; user checks and adds on finish.
- Settings → Accounts tab — **Account Library** sub-section with ADD+ for any unadded templates.

### Phase 8 — Global Search / Command Palette (complete)

- `src/ui/hooks/useSearch.ts` — debounced (200 ms) search across accounts, entries, and reports. Returns `SearchResult[]` typed `'account' | 'entry' | 'report'`.
- `src/ui/components/CommandPalette.tsx` — modal overlay; keyboard-navigable (↑/↓/Enter/Esc); grouped type labels; loading indicator.
- Toolbar search bar is now a button that opens the palette. `/` shortcut wired in `Layout.tsx`.
- `src/ui/lib/reports.ts` — `ALL_REPORTS` array (`id`, `label`, `description`, `path`) shared by the Reports Library page and search.

### Phase 9 — Multi-User Roles (complete, PostgreSQL mode only)

- `User` Prisma model: `id`, `email`, `passwordHash`, `role` (`Viewer | Bookkeeper | Admin`), `createdAt`. Added to `ensureSchema.ts` via `CREATE TABLE IF NOT EXISTS`.
- `src/db/repositories/userRepository.ts` — CRUD, `countAdmins`, `hasAnyUser`. Passwords: SHA-256 + random salt stored as `salt:hash`; compared with `timingSafeEqual`.
- `src/api/middleware/auth.ts` — in-memory session Map; `createSession`, `getSession`, `destroySession`, `requireAuth` preHandler. `isMultiUserMode()` returns true when `DATABASE_URL` is PostgreSQL. SQLite mode bypasses all auth.
- `src/api/routes/auth.ts` — `/auth/status`, `/auth/setup`, `/auth/login`, `/auth/logout`, `/auth/me`, `/auth/users` (CRUD + promote). Registered as `/auth` prefix in `server.ts`. Proxied in `vite.config.ts`.
- `src/ui/lib/auth.ts` — `getAuthToken`/`setAuthToken`/`clearAuthToken` (sessionStorage `cb_auth_token`), `checkAuthStatus`, `login`, `setupAdmin`.
- `src/ui/pages/LoginPage.tsx` — handles first-time Admin setup and subsequent logins. Rendered outside `Layout` directly from `App.tsx`.
- Auth gate in `App.tsx`: on load calls `/auth/status`; shows `LoginPage` for `'setup'` or `'login'` states; passes through in SQLite mode.
- Settings → **Users** tab: lists users with role badges; Add User form; Remove; Make Admin (requires admin password confirmation).

### Phase 10 — Vault Architecture (in progress)

Design spec: `docs/superpowers/specs/2026-05-08-vault-architecture-design.md`

**What changes:**
- `src/electron/vaultTypes.ts` — `VaultEntry` and `VaultState` shared types.
- `src/electron/vaultManager.ts` — new class: registry I/O (`userData/vaults.json`), vault creation (mkdir + `.corebooks` metadata + subdirs), rename (updates metadata + renames folder on disk + updates registry), list, select.
- `src/electron/main.ts` — vault-aware startup: creates main window immediately (no API yet), IPC handlers (`vault:getState` synchronous, `vault:list`, `vault:create`, `vault:select`, `vault:rename`, `vault:showInExplorer`, `vault:chooseDirectory`). `DATABASE_URL` is set from vault path (`<vaultPath>/corebooks.db`) instead of `userData`. `startApi()` is called after vault selection, not on app ready.
- `src/electron/preload.ts` — exposes `vault` IPC namespace. `apiBaseUrl` becomes null until vault is selected (read via sync `vault:getState` IPC on each preload execution, not from `additionalArguments`).
- `src/ui/pages/VaultPickerPage.tsx` — full-screen launch page rendered when `window.electronAPI.apiBaseUrl` is null. No API calls. Grid of vault cards + "New Vault" + "Open existing". After selection, `vault:ready` event triggers `window.location.reload()`.
- `src/ui/App.tsx` — checks `window.electronAPI?.apiBaseUrl` on load; renders `VaultPickerPage` if null; registers `vault.onReady` listener to reload.
- `src/ui/pages/SettingsPage.tsx` — new `vault` tab: editable vault name, read-only vault path, "Show in Finder/Explorer" button, "Switch vault" button.

**What does NOT change:** `src/core/`, `src/db/`, `src/api/` routes/middleware/bootstrap — all untouched.

**Vault rename flow:** user edits name in Settings → `vault:rename` IPC → vaultManager renames folder + updates `.corebooks` + updates registry → `app.relaunch()` + `app.exit(0)` → app restarts, user sees vault picker, opens renamed vault in one click.

**Web/Vite dev mode:** `window.electronAPI` is undefined in the browser — vault picker never renders, app works as before. No changes needed for dev/web mode.

---

## The Single Most Important Rule

**Never modify the core to accommodate an outer layer.**

The core is the accounting engine. It knows nothing about databases, screens, or external services. Everything else adapts to it — never the reverse.

**Acceptable precedent — `Ledger.reset()`:** Added for the data-wipe settings endpoint. It is a pure in-memory operation with no knowledge of why it is called. Test: could this method exist in a world with no database and no UI? If yes, it belongs in the core.

## Permanent Core Constraints

- `src/core` must remain dependency-free. No npm packages imported anywhere under `src/core/`.
- Every file in `src/core/types/` exports interfaces or enums only — no functions, no logic.
- Every function in `src/core/engine/` and `src/core/validation/` must have explicit parameter and return types.
- Tests for the core live in `tests/core/` mirroring `src/core/` structure.

## UI Constraints

- No business logic in UI components — components call `src/ui/api/client.ts` only.
- All amounts in the UI are already in dollars. Never multiply or divide by 100.
- Pages fetch fresh data on mount. No global client-side cache.
- `<main>` in `Layout.tsx` has `p-6`. Page root elements must not add redundant outer padding (e.g., no `p-6` on the outermost `<div>`).
- New module sidebar items must be gated behind `isFeatureEnabled(...)` from `src/ui/lib/featureFlags.ts`.

## Coding Conventions

- TypeScript strict mode. No `any` without explicit justification.
- All functions: explicit parameter and return types.
- Business logic in `src/core/engine/`. Data shapes in `src/core/types/`.
- Every core function must have a corresponding test.
- Commit messages: `feat:`, `fix:`, `docs:`, `test:`, `chore:`.

## Branding

- **Wordmark:** `corebooks` — all-lowercase in user-facing text; normal capitalization in code/docs.
- **Mascot:** pangolin (SVG removed from sidebar per user request).
- **Logo:** `src/ui/assets/logo.png` — terminal-style `~/ corebooks` lockup in the sidebar header. Do not replace without explicit instruction.
- **Font:** JetBrains Mono; global `font-weight: 300` for thin terminal aesthetic.

### Theme Colors

| Role | Token | Hex |
|---|---|---|
| Deepest background (sidebar) | `bg-void` | `#0a0c12` |
| Main background | `bg-base` | `#0f1117` |
| Card / panel surface | `bg-surface` | `#181c28` |
| Elevated surface | `bg-raised` | `#1e2235` |
| Borders | `border-rim` | `#2b3050` |
| Neon blue (primary accent) | `text-neon` / `bg-neon` | `#00d4ff` |
| Neon blue hover | `bg-neon-dim` | `#00a8cc` |
| Electric violet (secondary) | `text-violet` / `bg-violet` | `#a78bfa` |
| Primary text | `text-chalk` | `#eef2f8` |
| Muted text | `text-ash` | `#7d8a9e` |

Tokens defined in `src/ui/index.css` via Tailwind v4 `@theme`. Neon blue: primary actions, active nav. Electric violet: secondary badges (Equity type, contra markers).

## Accounting Principles

- Every journal entry must have at least two lines. Total debits must equal total credits. No exceptions.
- Account types: Asset, Liability, Equity, Revenue, Expense.
- Normal balances: Assets and Expenses are debit-normal; Liabilities, Equity, and Revenue are credit-normal.
- Assets = Liabilities + Equity at all times.
- Revenue and Expense are temporary accounts. `balanceSheet` folds net income directly into equity (no closing-entries step in the core). Do not add closing-entry logic to the core.
- `trialBalance` is live/unscoped. `balanceSheet` takes `asOf: Date`. `incomeStatement` takes `from`/`to`. Both replay `postedEntries` — they do not use the live balance map.
- Contra accounts are first-class: `isContra` and `contraTo` on `Account`. Abnormal balances are legal — the engine never rejects a mathematically valid transaction.
- Hard validation: ≥2 lines, valid accounts, positive amounts, debits = credits, valid date range. Soft advisories (e.g., debit to Revenue) warn but do not block.
- Amounts stored as Int cents in DB. `src/db/mappers.ts` is the only conversion boundary.

## Journal Entry / Draft Rules

- Drafts may be unbalanced. They don't appear in reports or affect balances.
- An entry promotes from draft to posted only when debits = credits exactly. Posted entries are permanent and immutable.
- Closing the New Entry modal with content silently saves a draft and fires the toast (auto-save).
- "New Entry" button always visible in the top toolbar regardless of page.
- Drafts can be deleted with a confirmation modal. Posted entries cannot be edited or deleted.

## Security Architecture

**SQLite mode (default):** API binds to `127.0.0.1`. Not reachable from the network. No auth.

**PostgreSQL mode:** TLS required. `src/db/client.ts` warns on missing `sslmode`. Settings UI shows amber banner. Session-based auth with Viewer/Bookkeeper/Admin roles enforced by `requireAuth` middleware.

| Feature | Location |
|---|---|
| API loopback-only | `src/api/bootstrap.ts` |
| PostgreSQL SSL validation | `src/db/client.ts`, settings route, Settings UI |
| safeStorage encryption key | `src/electron/main.ts` (`COREBOOKS_DB_KEY`) — lives in `userData`, NOT in vault |
| Encrypted export (AES-256-GCM + PBKDF2) | `src/ui/lib/crypto.ts`, `ExportPasswordModal.tsx` |
| Session auth (PostgreSQL mode only) | `src/api/middleware/auth.ts`, `src/api/routes/auth.ts` |
| Vault registry | `userData/vaults.json` — list of known vault paths + last-opened timestamps |
| Vault metadata | `<vault>/.corebooks` — name, version, created date (no secrets) |

**Vault and key separation:** The vault folder (`<vault>/corebooks.db`, `<vault>/.corebooks`) contains no key material. The OS-keychain key (`userData/.db.key`) is intentionally outside any vault so vaults can be moved, copied, or backed up independently without compromising the encryption key.

**SQLCipher gap:** Key is in the OS keychain. Blocker: `PrismaBetterSqlite3` creates the `better-sqlite3` instance internally — no way to pass a pre-opened database or run `PRAGMA key` before Prisma opens the file. Fix: swap to `better-sqlite3-sqlcipher` and write a custom Prisma adapter that accepts a pre-opened encrypted instance.

## Self-Review Checklist

1. **Stale data** — async flows may capture stale state; verify latest values are re-fetched.
2. **Type-check** — `tsc --noEmit` (server) and `tsc --project src/ui/tsconfig.json --noEmit` (UI). Zero errors.
3. **Edge cases** — empty lists, undefined optionals, zero amounts, missing IDs.
4. **Consistency** — follow existing patterns (error handling, naming, file layout).
5. **Onion rule** — no outer-layer change should touch `src/core/`.
6. **Fresh diff read** — re-read every changed line for logic inversions, off-by-one, wrong variables, silent no-ops.

## What NOT to Do

- Do not install packages into `src/core/`.
- Do not use `console.log` for error handling — use TypeScript error types.
- Do not skip tests for core functions.
- Do not make silent changes — always explain what changed and why.

## Potential Features

All new modules must gate sidebar items behind `src/ui/lib/featureFlags.ts`. Open a design conversation before building any of these.

**AR/AP Manager:** `Customer`, `Vendor`, `Invoice` models. Invoice creation auto-posts a balanced entry through the existing engine — never writes directly to the ledger. Aging view (30/60/90 days). Gate: `isFeatureEnabled('ar_ap')`.

**Inventory:** `InventoryItem` (SKU, unit cost, qty on hand). Receive/sell goods auto-post COGS entries. First iteration: no FIFO/LIFO, no multi-location. Gate: `isFeatureEnabled('inventory')`.

**Import from Other Software:** CSV column mapping → draft entries for user review before posting. QuickBooks .IIF parsing. Fuzzy account name matching. Imports always create drafts, never auto-post.

**PostgreSQL Migration Wizard:** In-app guided wizard (Settings → Database) to move from SQLite to PostgreSQL. JSON snapshot export, migration, import. No "schema" or "adapter" in user-facing text.

**Bank Feed Import:** OFX/QFX/CSV bank statements → auto-match or create draft entries. Requires vault architecture (Phase 10) — statements land in `<vault>/imports/`, watched by the app, processed into the draft review queue. Imports always create drafts, never auto-post.

**AI-Assisted Categorisation (Ollama):** Optional built-in feature (not a plugin). If Ollama is running at `localhost:11434`, the bank import flow can request account categorisation suggestions for each transaction. Falls back gracefully to manual mapping if Ollama is absent. Configured in Settings → AI tab. Not a plugin — same pattern as PostgreSQL mode (optional, configuration-gated, first-party).

**Plugin API:** Webhook interface for Stripe, Shopify, payroll providers.

**Closing Entries:** Period-end close zeroing Revenue/Expense into Retained Earnings.

**Multi-currency:** Foreign currency transactions with exchange rate tracking and unrealised gain/loss accounts.
