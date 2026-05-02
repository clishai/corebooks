# CoreBooks — Claude Code Instructions

## What This Project Is

CoreBooks is an open-source, self-hosted, privacy-first accounting application built in TypeScript. It follows Onion Architecture — the innermost layer is a pure double-entry accounting engine with zero external dependencies. Each outer layer adds functionality without ever modifying the core.

Explaining the "why" behind your decisions is as important as the working code itself. Never make a change without explaining what it does and why.

## Prior Phases

**Phase 1 — Project Infrastructure**

Foundation files are in place. TypeScript project (package.json and
tsconfig.json) initialized, documentation, licensing, and contribution
guidelines in place.

**Phase 2 — Core Accounting Engine**

The pure in-memory accounting engine is complete. No external dependencies
exist in src/core. All 44 tests pass. Key design decisions made in this phase:

- `Ledger` is an explicit stateful object passed into engine functions —
  no globals, easy to unit test, ready for a persistence boundary in Phase 3.
- Revenue and Expense accounts flow into equity on the balance sheet
  (current-period net income) since no closing-entries step exists yet.
- `reverseEntry` refuses to reverse a reversal to prevent audit-trail loops.
- `balanceSheet` rebuilds balances from the posted-entry log for any `asOf`
  date; `incomeStatement` accepts an explicit `from`/`to` range.
- Amounts are stored as JavaScript numbers (IEEE 754). In Phase 3, when
  persistence is added, amounts will convert to integer cents at the
  boundary between the core and the database layer.

**Phase 3 — Persistence and API**

The database layer and REST API are complete. Key decisions:

- Prisma 7 with `@prisma/adapter-better-sqlite3` (SQLite default).
- Schema: `Account`, `JournalEntry`, `JournalLine` models in
  `prisma/schema.prisma`. Amounts stored as Int (cents).
- Mapper layer (`src/db/mappers.ts`) is the sole place for cent↔number
  conversion. Core never sees cents; DB never sees floats.
- Fastify 5 REST API. All routes live in `src/api/routes/`. No accounting
  logic in routes — they delegate entirely to repositories and the core engine.
- Routes: `GET/POST /accounts`, `PATCH /accounts/:id`, `GET /entries`,
  `POST /entries/draft`, `POST /entries/post`, `POST /entries/:id/reverse`,
  `DELETE /entries/:id`, `GET /reports/trial-balance`,
  `GET /reports/balance-sheet`, `GET /reports/income-statement`.
- SQLite is the default. PostgreSQL is supported by changing the provider in
  `prisma/schema.prisma` and regenerating the client.

**Phase 3 tests — complete**
- `tests/db/` — account and entry repository tests against a real temp SQLite file.
- `tests/api/` — Fastify `inject()` tests for accounts, entries, and reports routes.
- `tests/helpers/testDb.ts` — shared helper: creates UUID-named temp SQLite,
  runs migration SQL, clears and destroys between tests.
- `vitest.config.ts` has `fileParallelism: false` to prevent `DATABASE_URL`
  env var races across test files.
- Total: 104 tests passing (44 core + 26 DB + 34 API).

## Branding

### Mascot
The CoreBooks mascot is a **pangolin**. The pangolin SVG was removed from
the sidebar at the user's request.

### Logo asset
`src/ui/assets/logo.png` — a terminal-style `~/ corebooks` lockup with a
transparent background and white elements, sized to fill the sidebar header.
Imported and rendered in `src/ui/components/Layout.tsx`. Do not replace or
remove it without an explicit instruction.

### Logo
The wordmark is `corebooks` — all-lowercase, bold weight, no capitalization.
Never title-case it (not "CoreBooks") in user-facing text or the UI. In
developer documentation and code (class names, variable names, commit
messages) the standard capitalization rules apply.

### Theme
The UI uses a dark mode theme throughout. These are the canonical color
values — use them and do not introduce competing color schemes:

| Role | Token | Hex |
|---|---|---|
| Deepest background (sidebar) | `bg-void` | `#0a0c12` |
| Main background | `bg-base` | `#0f1117` |
| Card / panel surface | `bg-surface` | `#181c28` |
| Elevated surface | `bg-raised` | `#1e2235` |
| Borders | `border-rim` | `#2b3050` |
| **Neon blue (primary accent)** | `text-neon` / `bg-neon` | `#00d4ff` |
| Neon blue hover | `bg-neon-dim` | `#00a8cc` |
| **Electric violet (secondary accent)** | `text-violet` / `bg-violet` | `#a78bfa` |
| Primary text | `text-chalk` | `#eef2f8` |
| Muted text | `text-ash` | `#7d8a9e` |

All custom tokens are defined in `src/ui/index.css` via Tailwind v4 `@theme`.
The neon blue is used for primary action buttons, active nav indicators, and
interactive accents. Electric violet is used for secondary badges (e.g. Equity
account type, contra markers) and will expand to other secondary UI states in
future phases.

---

## Current Phase

**Phase 5 — Electron desktop app (complete)**

Phases 1–5 are all complete. The app can be built as a native desktop installer.

Run in development:
- `npm run dev` — starts both servers; Vite waits for `GET /health` to return 200 before
  opening (30 s timeout). If either process crashes, both stop (`--kill-others-on-fail`).
  Terminal output is color-labeled: `api` in cyan, `ui` in magenta. Primary command.
- `npm run dev:api` / `npm run dev:ui` — individual servers, useful for debugging one at a time
- Both servers bind to `127.0.0.1` only — not reachable from other devices on the network
- `GET /health` — lightweight liveness endpoint (`{ ok: true }`), no DB access, used by `wait-on`

Build and package:
- `npm run build:all` — compiles TypeScript + Vite UI into `dist/`
- `npm run dev:electron` — opens Electron pointing at the Vite dev server
- `npm run package` — produces a platform installer in `release/`

Release distribution:
- `.github/workflows/release.yml` — push a `v*` tag to trigger a GitHub Actions matrix build
  that packages macOS (.dmg), Windows (.exe), and Linux (.AppImage) and attaches them to a
  GitHub Release automatically. Code signing is deferred to v1.0 public release.
- `docs/index.html` — GitHub Pages landing page with download buttons. Enable via
  repo Settings → Pages → Branch: main, Folder: /docs. Live at `clishai.github.io/corebooks`.

### Phase 4 Scope

**Completed:**
- `src/ui/api/client.ts` — typed fetch wrappers for all API and report endpoints.
- `src/ui/components/Layout.tsx` — dark sidebar with `src/ui/assets/logo.png`
  in the header (terminal-style `~/ corebooks` lockup, fills sidebar width),
  Reports nav section, cog icon pinned to the bottom-left for Settings, neon
  blue "+ New Entry" toolbar button. Top toolbar shows company name (from
  `localStorage`) instead of the static "corebooks" string.
- `src/ui/components/NewEntryModal.tsx` — journal entry form (dark mode):
  date, memo, payment method, debit/credit line grid, live balance indicator,
  Save Draft and Post Entry actions.
- `src/ui/components/NewAccountModal.tsx` — create account form (dark mode);
  auto-sets normal balance based on account type.
- `src/ui/pages/AccountsPage.tsx` — chart of accounts table with dark-mode
  color-coded type badges and a New Account button.
- `src/ui/pages/EntriesPage.tsx` — posted entries table with expandable rows
  showing individual debit/credit lines (dark mode).
- `src/ui/pages/TrialBalancePage.tsx` — accounts grouped by type (Asset /
  Liability / Equity / Revenue / Expense) with debit/credit columns; balanced
  status indicator.
- `src/ui/pages/BalanceSheetPage.tsx` — collapsible sections: Current Assets,
  Non-current Assets, Current Liabilities, Non-current Liabilities, Equity
  Accounts; per-account lines with number and signed balance; Net Income shown
  as a separate "current period · unreconciled" sub-line within Equity. `asOf`
  date picker.
- `src/ui/pages/IncomeStatementPage.tsx` — collapsible Revenue and Expenses
  sections with per-account lines; Net Income grand total. `from` / `to` date
  range pickers.
- `src/ui/pages/DraftsPage.tsx` — Drafts table with Open (reopens modal pre-filled)
  and Delete (requires confirmation modal) actions.
- `src/ui/components/Toast.tsx` — bottom-right corner auto-dismiss notification.
- `src/ui/components/FirstLaunchModal.tsx` — one-time welcome modal shown on
  first launch. Collects company name (stored in `localStorage` as
  `cb_company_name`; displayed in the top toolbar immediately on dismiss).
  Explains local-first storage and optional multi-user setup in plain language.
  `localStorage` key `cb_welcomed` gates whether the modal shows.
- Auto-save on modal close: if the New Entry modal is closed with content in the
  form, the draft is saved silently and the toast fires. Implemented in
  `NewEntryModal.handleClose`.
- `GET /entries/drafts` API route + `listDraftEntries` repository function.
- `src/api/routes/settings.ts` — settings routes now accept `AppContext` so
  the wipe endpoint can reset the in-memory ledger. Four endpoints:
  - `GET /settings/database` — returns `{ type, path }`.
  - `GET /settings/stats` — returns `{ accounts, postedEntries, draftEntries, fileSizeBytes }`.
    File size is read from the SQLite file via `fs.stat`; null for PostgreSQL.
  - `GET /settings/export` — returns all accounts + all entries (posted and
    draft) as `{ exportedAt, version, accounts, entries }`. The UI downloads
    this as `corebooks-export-YYYY-MM-DD.json`.
  - `POST /settings/wipe` — deletes all journal entries (cascades to lines)
    and all accounts, then calls `ledger.reset()` to clear the in-memory state.
- `src/core/engine/ledger.ts` — added `reset()` method: clears the balances
  map, empties `postedEntries`, and resets `nextEntryId` to 1. Used only by
  the wipe endpoint; the core has no knowledge of why it is called.
- `vite.config.ts` — added `/settings` to the Vite dev proxy so settings API
  calls are forwarded to the Fastify server on port 3000. (Previously missing,
  which caused a "string did not match expected pattern" browser URL error.)
- `src/ui/lib/metrics.ts` — defines 10 home-page metric IDs and labels,
  default selection (`cash_balance`, `net_income_30d`, `gross_revenue_30d`),
  `localStorage` read/write helpers (`cb_home_metrics`), and layout helpers
  (`cb_home_layout`: `'compact' | 'comfortable'`, default `'comfortable'`).
- `src/ui/lib/alerts.ts` — alert snooze logic. Two alert IDs: `'drafts'`
  (unposted drafts exist) and `'memos'` (posted entries missing memo text).
  `isDismissed(id)` checks `cb_alert_dismissed_{id}` against the global snooze
  duration (`cb_alert_snooze`). `dismissAlert(id)` writes the current timestamp.
  Snooze options: 10 min, 1 hr, 6 hrs, 1 day, 1 week, Never. Default: 1 day.
  "Never" means once dismissed the alert does not reappear until localStorage
  is cleared.
- `src/ui/pages/HomePage.tsx` — default landing page. Picks one of 20
  all-lowercase welcome messages at random on each mount. Features:
  - **Alerts section** (top): amber banner per active alert type, each with a
    Dismiss button. Alerts reappear after the user-configured snooze duration.
    Banners are hidden immediately on dismiss and re-evaluated on next mount.
  - **Metrics row**: selected metrics rendered as fixed-width cards in a
    `flex-wrap` row. Card width is controlled by the layout setting (`w-44`
    compact / `w-64` comfortable). Each card shows the value color-coded and a
    ▲/▼ change indicator vs the equivalent prior period.
  - **Most Recent Entry card** (bottom): shows the last posted entry — memo,
    date, payment method badge, and up to 4 debit/credit lines with account
    names resolved from the accounts list. "+N more" indicator if lines exceed 4.
    Links to the Entries page. Shows a placeholder when no entries exist yet.
  - Cash & Bank Balance computed from the trial balance by summing Asset
    accounts whose name contains "cash" or "bank".
- `src/ui/pages/SettingsPage.tsx` — Home tab has three sections:
  1. **Metric card size** — compact / comfortable toggle, saves to `cb_home_layout`.
  2. **Visible metrics** — checkbox list, saves to `cb_home_metrics`.
  3. **Alert reminders** — radio list for snooze duration, saves to `cb_alert_snooze`.
  Database tab now shows a **"What's stored"** stats row (accounts, posted
  entries, drafts, file size), an **Export Data** button (downloads JSON backup),
  and a **Wipe All Data** button (opens a confirmation modal; on confirm calls
  the wipe endpoint and shows a success message).
- Phase 3 DB and API tests (see above).
- Bug fixes applied:
  - `entryRepository.ts` now uses `toDbCents()` from `src/db/mappers.ts`
    instead of an inline `Math.round(line.amount * 100)`.
  - `listDraftEntries` uses `orderBy: [{ createdAt: 'desc' }, { id: 'desc' }]`
    to avoid non-deterministic order when two entries share the same SQLite
    second-precision timestamp.
  - DELETE requests no longer send `Content-Type: application/json` (Fastify
    rejects an empty body with that header). The `request()` helper in
    `client.ts` now only sets the header when a body is present.
  - Settings metrics checkboxes now have an `onClick` on the `<label>` element
    (the custom div checkbox has no native input, so no implicit activation).

**Phases 4 and 5 are complete.**

### Post-Phase 5 additions (current session)

**Account current/non-current classification**
- `Account` core type and Prisma schema gained an optional `classification: 'current' | 'non-current'`
  field (defaults to `undefined`, treated as current in reports).
- Migration: `prisma/migrations/20260502180906_add_account_classification/migration.sql` —
  `ALTER TABLE "Account" ADD COLUMN "classification" TEXT`.
- `src/db/ensureSchema.ts` uses `PRAGMA table_info` to add the column on existing databases
  automatically (idempotent).
- `NewAccountModal` shows a **Classification** radio row (Current / Non-current) whenever
  type is Asset or Liability. A hoverable `?` badge in the row header shows a 2-sentence
  context-sensitive tooltip (different copy for assets vs. liabilities).

**Financial statement expansion**
- `BalanceSheet` interface (core + UI client) gained `currentAssets`, `nonCurrentAssets`,
  `currentLiabilities`, `nonCurrentLiabilities`, `retainedEquityAccounts` section fields
  (`BalanceSheetSection = { lines: BalanceSheetLine[], total }`). All existing aggregate
  fields (`assets`, `liabilities`, `retainedEquity`, `netIncome`, `equity`, `balanced`)
  unchanged — no tests broken.
- `IncomeStatement` gained `revenueLines` and `expenseLines` arrays alongside the existing
  `revenue`, `expenses`, `netIncome` totals.
- Balance sheet correctly shows Net Income as a distinct "current period · unreconciled"
  line within the Equity section, separate from permanent Equity accounts.

**UI overhaul — cypherpunk aesthetic**
- **Font:** JetBrains Mono (Google Fonts) loaded via `src/ui/index.html` (weights 100–800)
  and set as the global `font-family` and Tailwind `--font-sans` / `--font-mono` in
  `src/ui/index.css`. Global `font-weight: 300` (Light) is set on `html/body/#root` for a
  thin, boxy terminal aesthetic; elements that explicitly carry `font-medium`, `font-semibold`,
  or `font-bold` Tailwind classes still render at their own weight, preserving hierarchy.
- **Financial statement tables:** spreadsheet-like grid with consistent 4-column layout
  (chevron | account number | name | amount), `border-collapse`, `bg-void` section headers
  in neon uppercase, `border-rim` grid lines, `rounded-sm` (sharper than the previous
  `rounded-lg`). Expandable rows follow the same ▸/▾ pattern as `EntriesPage`.
- **Page transitions:** `src/ui/components/Layout.tsx` tracks the previous route index via
  a `useRef` updated in `useLayoutEffect`. On each navigation the `<main>` element gets
  `key={location.key}` (forces remount) plus either `page-slide-right` or `page-slide-left`.
  Keyframes + spring cubic-bezier `(0.34, 1.56, 0.64, 1)` are defined in `index.css`.
  Duration: 220 ms.

**Chart of Accounts enhancements**
- **Edit button:** Each account row has a hidden Edit button in the far-right column that
  fades in on row hover (`opacity-0 group-hover:opacity-100 transition-opacity`). Clicking
  it opens `src/ui/components/EditAccountModal.tsx`, a pre-filled form identical in structure
  to `NewAccountModal`. On save, `PATCH /accounts/:id` is called; the row updates in place
  and the trial balance is re-fetched so the balance column stays accurate. All fields are
  preserved on save — including `contraTo` — so editing never silently drops data.
- **Contra column:** Header renamed "Contra?"; contra accounts show a green `✓` (emerald)
  instead of the word "Contra". Non-contra rows keep the `—` placeholder.
- **Current Balance column:** Fetches `GET /reports/trial-balance` on mount alongside the
  accounts list. Balance is computed as `debit − credit` for debit-normal accounts and
  `credit − debit` for credit-normal accounts. Zero balances display in muted ash. Abnormal
  balances (negative result) display in amber with a `!` prefix. Re-fetched after any edit.
- **Column visibility:** `src/ui/lib/accountColumns.ts` defines 5 toggleable columns
  (`type`, `normalBalance`, `contra`, `classification`, `balance`) with `localStorage` key
  `cb_accounts_columns`. All default to visible. Number and Name are always visible and
  cannot be hidden. `colSpan` for the empty-state row is computed as `3 + visibleCols.length`
  (2 fixed + N optional + 1 edit-button column), so it auto-adjusts as columns are toggled.

**Settings — accounts tab**
- `src/ui/pages/SettingsPage.tsx` gained a third tab "accounts" (between "home page" and
  "database"). It renders `AccountsSettings`, which uses the same neon-checkbox pattern as
  the home metrics selector to toggle the 5 optional chart-of-accounts columns. Changes save
  immediately to `cb_accounts_columns` in `localStorage`. `AccountsPage` re-reads the
  setting on window focus, so toggling in Settings and navigating back reflects the change
  without a hard reload.

**Pending UI items discussed but not yet built:**
- **Payment methods in Settings** — the spec describes a user-managed list of
  payment methods (cash, check, ACH, credit card) stored in settings and
  referenced on journal entries. The Settings page has three tabs today
  ("home page", "accounts", "database"). A "payment methods" tab still needs to
  be added with a simple add/remove list UI and persistence (API or localStorage
  TBD). The `NewEntryModal` already has a payment method field; it currently
  accepts free-text and should eventually pull from this managed list.

**Code condensation (no behavior changes)**
- `Ledger.applyLines` — private static helper eliminates 3 copies of the 7-line
  balance-accumulation loop shared by `applyEntry`, `buildBalancesAsOf`, and
  `buildBalancesInRange`.
- `validateEntry` — merged two separate `forEach` passes over lines into one;
  replaced two `filter+reduce` chains for debit/credit totals with a single loop;
  `MIN_DATE` extracted as a module-level constant.
- `loadLedger` — now calls `listPostedEntries()` instead of duplicating its query.
- `isPostgresUrl` / `postgresHasSSL` — extracted from `src/db/client.ts` and exported;
  `settings.ts` now imports them instead of copy-pasting the 4-condition SSL check.
- `DraftsPage` — merged byte-identical `handleModalClose` / `handlePosted` into one handler.

### Phase 5 — Electron Desktop App (complete)

Delivered in this phase:

- `src/electron/main.ts` — Electron main process. Finds a free port via
  `net.createServer`, sets `DATABASE_URL` to `app.getPath('userData')/corebooks.db`
  before any Prisma module loads (dynamic import used to guarantee ordering),
  generates/retrieves a 256-bit at-rest encryption key via `safeStorage` (stored
  as `COREBOOKS_DB_KEY` in env — see Security Architecture for SQLCipher next steps),
  then starts the API and opens the BrowserWindow.
- `src/electron/preload.ts` — reads `--api-port=N` injected via `additionalArguments`
  and exposes `window.electronAPI.apiBaseUrl` via `contextBridge`. Synchronous —
  no IPC round-trip before the React app loads.
- `src/api/bootstrap.ts` — programmatic `startServer(port)` called by Electron.
  Runs `ensureSchema()` before Prisma connects, then listens on `127.0.0.1` only.
- `src/db/ensureSchema.ts` — creates all three SQLite tables (`Account`,
  `JournalEntry`, `JournalLine`) via `CREATE TABLE IF NOT EXISTS` using
  `better-sqlite3` directly. Replaces the need for `prisma migrate deploy` in
  the packaged Electron app where the migration engine binary is not available.
- `src/ui/electron.d.ts` — global `Window` type augmentation for `electronAPI`.
- `src/ui/api/client.ts` — `getBaseUrl()` returns `window.electronAPI.apiBaseUrl`
  in Electron, empty string (relative URL) in the Vite dev server. Dev workflow
  is unchanged.
- `vite.config.ts` — `base: './'` added so built asset paths are relative,
  required for correct `file://` loading in Electron.
- `package.json` — `"main": "dist/electron/main.js"`, new scripts (`build:all`,
  `dev:electron`, `package`), `build` script copies `src/generated/` to
  `dist/generated/` post-compile, `electron-builder` config with `asarUnpack`
  for `better-sqlite3` native bindings.

**Security features added alongside Phase 5 (see Security Architecture section):**
- PostgreSQL SSL enforcement — warning in `src/db/client.ts` + `sslEnabled` in
  `/settings/database` API + amber warning banner in Settings UI.
- Encrypted export — AES-256-GCM + PBKDF2 (600 000 iterations) via Web Crypto,
  client-side. New "Encrypted Export" button in Settings → Database.
- safeStorage key infrastructure — 256-bit key in OS keychain, ready for
  SQLCipher once a compatible Prisma adapter is available.

**Logo**
- `src/ui/assets/logo.png` — terminal-style `~/ corebooks` lockup, transparent background,
  white elements. Processed from the source PNG (`Documents/corebooks logo terminal block.png`)
  via Python/Pillow: flood-fill background removal, colour inversion for dark theme, crop to
  bounding box.
- `src/ui/components/Layout.tsx` — imports `logoSrc` from `../assets/logo.png`; renders
  `<img src={logoSrc} alt="corebooks" className="w-full" />` in the sidebar header, replacing
  the previous placeholder `div` + wordmark `span`.

**Dev server reliability**
- `tsx` and `wait-on` added as dev dependencies (no longer called via `npx`).
- `dev:api` — `tsx watch src/index.ts` (local dep, no npx overhead).
- `dev:ui` — `wait-on --timeout 30000 http://127.0.0.1:3000/health && vite`. Vite only starts
  after the API confirms it is healthy; times out with a clear error after 30 s if the API
  never starts.
- `dev` — `concurrently --kill-others-on-fail -n api,ui -c cyan,magenta`. If either process
  crashes, the other is killed. Output is color-labeled.
- `build` — `npx prisma generate` replaced with `prisma generate` (local dep).
- `GET /health` added to `src/api/server.ts` — returns `{ ok: true }`, no DB access.
  Also added to the Vite dev proxy in `vite.config.ts`.
- Port-conflict error in `src/index.ts` — catches `EADDRINUSE` and prints a plain-English
  message before exiting, instead of a raw stack trace.

**Begin here next session: Onboarding questionnaire + feature flag system.**

The recommended next task is the multi-step setup wizard (see Future Feature
Ideas → Onboarding Questionnaire). It replaces `FirstLaunchModal`, collects the
business name and business type, and populates the feature flag toggles that
will gate AR/AP and inventory modules. Build this before any new modules so the
toggle infrastructure is in place when those features land. Full spec is in the
Future Feature Ideas section.

The balance sheet and income statement now return per-account section breakdowns.
Any future BalanceSheetPage or IncomeStatementPage work should preserve the
`BalanceSheetSection` / `BalanceSheetLine` types introduced in this session.

### Phase 4 UI Constraints
- No business logic in UI components. Components call `src/ui/api/client.ts`;
  they never talk to Prisma or the core engine directly.
- All amounts displayed in the UI are already in dollars (the mapper layer
  handles cent conversion). The UI never multiplies or divides by 100.
- Pages fetch fresh data on mount. There is no global client-side cache yet —
  navigating to a page always triggers a fresh API call.

### Phase 4 — UI and Database Wizard — Requirements to carry forward

**Global toolbar:**
The top toolbar is always visible. It contains:
- A **"New Entry" button** on the right side — always present, always clickable,
  regardless of which page the user is on. This is the primary action in the app.
- Future items (search, notifications, user menu) may be added here in later phases.

**First-launch notice for businesses:**
On the very first launch (detected by an empty database or a `firstLaunch`
flag), show a dismissible modal or banner that explains:
- CoreBooks defaults to SQLite (great for personal use, one machine).
- Businesses with multiple employees should switch to PostgreSQL so all
  staff can access the same data simultaneously.
- A step-by-step migration wizard is available in Settings → Database.

This notice must be written in plain language — assume the reader is not
a developer. Never use the word "schema" or "adapter" in user-facing text.

**Settings → Database page:**
- Show the current database type (SQLite / PostgreSQL) and file path.
- Provide a guided PostgreSQL setup wizard: validate connection string,
  run migrations, confirm data export/import before switching.
- Link to `.env.example` docs for advanced users.

### Permanent Core Constraints (all phases)

- `src/core` must remain dependency-free. No npm packages may be imported
  into any file under `src/core/`.
- Every file in `src/core/types/` exports interfaces or enums only — no
  functions, no logic.
- Every function in `src/core/engine/` and `src/core/validation/` must have
  explicit parameter and return types.
- The core must have no knowledge of databases, files, or user interfaces.
- Tests for the core live in `tests/core/` and mirror the structure of `src/core/`.

## Architecture

    src/
      core/         ← Layer 1: Pure accounting engine. Zero external dependencies.
        types/      ← Interfaces and type definitions
        engine/     ← Business logic functions
        validation/ ← Accounting rules and constraints
      db/           ← Layer 2: Database layer (Prisma + SQLite/PostgreSQL) — Phase 3
      api/          ← Layer 3: REST API (Express/Fastify) — Phase 3
      ui/           ← Layer 4: React + Tailwind frontend — Phase 4
    tests/
      core/         ← Unit tests for the accounting engine

## The Single Most Important Rule

**Never modify the core to accommodate an outer layer.**

If a database, API, or UI feature seems to require changing `src/core/`, stop and find a different approach. The core is the accounting engine. It knows nothing about databases, screens, or external services. Everything else adapts to it — never the reverse.

**Precedent — `Ledger.reset()`:** The data-wipe feature in the settings API needed to clear the in-memory ledger after deleting all database records. Rather than rebuilding the server process or exposing internal state, a `reset()` method was added to `Ledger`. This was acceptable because `reset()` is a pure in-memory operation (clears balances, empties `postedEntries`, resets `nextEntryId`) with no knowledge of why it is called, who calls it, or that a database exists. It is conceptually equivalent to constructing a fresh `Ledger()` but without replacing the shared reference. The test for acceptability: could this method exist in a world with no database and no UI? If yes, it belongs in the core.

## Coding Conventions

- TypeScript strict mode is enabled. No `any` types without explicit justification.
- All functions must have explicit parameter types and return types.
- Business logic lives in `src/core/engine/`. Data shapes live in `src/core/types/`.
- Every function in the core must have a corresponding test in `tests/core/`.
- Commit messages follow Conventional Commits format:
  - `feat:` new feature
  - `fix:` bug fix
  - `docs:` documentation only
  - `test:` adding or updating tests
  - `chore:` tooling, config, setup

## Accounting Principles Encoded Here

- Every journal entry must have at least two lines.
- Total debits must equal total credits on every entry. No exceptions.
- Account types: Asset, Liability, Equity, Revenue, Expense.
- Normal balances: Assets and Expenses carry debit balances. Liabilities, Equity, and Revenue carry credit balances.
- The accounting equation must hold at all times: Assets = Liabilities + Equity.
- Revenue and Expense are **temporary accounts**. In a system with period closing,
  they close to Retained Earnings at year-end. CoreBooks has no closing-entries
  step in Phase 2, so the `balanceSheet` function folds current-period net income
  (Revenue − Expenses) directly into the equity total. This preserves the equation
  mid-period: `Assets = Liabilities + (Permanent Equity + Net Income)`. Do not
  add closing-entry logic to the core; it belongs in the API or UI layer.
- `trialBalance` always reflects the current (live) ledger state and is not
  date-scoped. `balanceSheet` takes an `asOf: Date`. `incomeStatement` takes
  `from` and `to` dates. Both rebuild balances by replaying `postedEntries` — 
  they do not use the live balance map.

## Self-Review Checklist

After completing any implementation, always review the code before reporting it done:

1. **Stale state / stale data** — async flows that capture a value from state at
   render time may be out of date by the time they execute. Check that the latest
   value is always read or re-fetched where it matters.
2. **Type-check** — run `tsc --noEmit` (server) and
   `tsc --project src/ui/tsconfig.json --noEmit` (UI) and confirm zero errors.
3. **Edge cases at boundaries** — empty lists, undefined optional fields, zero
   amounts, and missing IDs should all be handled or explicitly documented as
   non-cases.
4. **Consistency** — new code should follow the same patterns already in use
   (error handling style, naming, file layout) rather than introducing a
   different approach without reason.
5. **The onion rule** — confirm that no change in an outer layer (db, api, ui)
   required touching anything in `src/core/`.
6. **Fresh read of the diff** — re-read every changed line as if seeing it for
   the first time. Ask: does each line do exactly what was intended, nothing
   more and nothing less? This is the catch-all for any error type not covered
   above — logic inversions, off-by-one, copy-paste mistakes, wrong variable
   used, silent no-ops, unreachable code, and anything else that only becomes
   visible when you slow down and read carefully.

## What NOT to Do

- Do not install external packages into `src/core/`. It must remain dependency-free.
- Do not use `console.log` for error handling — use proper TypeScript error types.
- Do not skip tests. If a function exists in the core, a test must exist for it.
- Do not make silent changes. Always explain what changed and why.

## Target Product Direction

CoreBooks is being built toward a **downloadable desktop application** —
a single file a user double-clicks to open, with no terminal commands, no
server setup, and no cloud account required. All data lives on the user's
own device by default.

The current terminal-based development setup (`npm run dev`) is
**developer/contributor workflow only**, not the end-user experience.
Users should never need to know what a terminal is.

**Phase 5 has wrapped CoreBooks in Electron** — Chromium renders the UI,
Node.js runs the Fastify API server in-process, and SQLite stores the data.
The Fastify server starts automatically when the app opens. The user
double-clicks the app and sees the UI immediately.

PostgreSQL remains opt-in for multi-user setups; SQLite works out of the
box with zero configuration.

Constraints enforced in Phase 5 and still active:
- `localhost:3000` is never hardcoded — the port is dynamically assigned and
  injected into the renderer via `window.electronAPI.apiBaseUrl`.
- The API server is started programmatically via `src/api/bootstrap.ts`, not
  via a CLI command.
- The SQLite file lives in `app.getPath('userData')`, not the project folder.

## Stack

- Language: TypeScript (strict mode)
- Runtime: Node.js
- Database: SQLite via Prisma 7 + `@prisma/adapter-better-sqlite3` (default);
  PostgreSQL supported by swapping the provider
- Frontend: React 19 + Vite 8 + Tailwind v4 (src/ui/)
- API: Fastify 5 + @fastify/sensible (src/api/)
- Testing: Vitest
- Package manager: npm
- **Phase 5 (complete):** Electron — bundles the full app into a downloadable
  desktop application (.exe on Windows, .app on macOS, AppImage on Linux)

### Journal Entry — Balance Enforcement and Draft State
The core engine maintains a strict separation between draft and posted entries.
Draft entries may be unbalanced and saved at any time — they serve as a
staging area for incomplete work. Drafts are not assigned an official entry
number, do not appear in any financial reports, and have no effect on account
balances. An entry is only promoted from draft to posted when debits equal
credits exactly. Once posted, it is permanent and immutable. The accounting
engine only operates on posted entries.

Draft behavior:
- Any unposted entry is automatically saved as a draft if the user closes
  the tab or navigates away — no work is ever lost silently. A small notification
  should appear in the corner of the screen to inform the user that the autosave has occurred.
- A **"New Entry" button is always visible in the top toolbar**, regardless of
  which page the user is on. Clicking it opens the journal entry form as a modal.
- Within the entry form, a persistent "Save Draft" button is always visible
  so the user can save incomplete work at any time.
- Drafts can be deleted by the user via a delete button that triggers a
  confirmation modal: "Are you sure you want to delete this entry?"
  Deletion requires explicit confirmation and cannot be undone.
- Autosave and manual save both apply to drafts only. Posted entries
  are immutable and cannot be edited or deleted.

### Contra Accounts
Contra accounts are first-class citizens in CoreBooks. The Account interface
includes an isContra boolean and an optional contraTo field referencing the
parent account type. Contra accounts carry a normal balance opposite to their
parent type. The reporting layer nets contra accounts against their parent
accounts automatically. The engine never rejects a transaction solely because
it pushes an account to the opposite side of its normal balance — abnormal
balances are a valid real-world condition, not an error.

### Payment Methods
Users can define a list of payment methods for their organization (e.g. cash,
check, ACH, credit card). This list is managed in settings and referenced
on journal entries as an optional field. The core engine does not require
a payment method — it is metadata that aids categorization and reporting
but has no effect on the accounting equation.

### Validation vs. Advisories
The core engine distinguishes between hard validation rules and soft
advisories. Hard rules enforce mathematical correctness and reject entries
that violate them: minimum two lines, valid account references, positive
amounts, debits equal credits, date in valid range. Soft advisories warn
the user about unusual but legal patterns — for example, debiting a
Revenue account or using a contra account as a primary line. Advisories
surface in the UI (yellow caution indicators) but do not block posting.
The engine never rejects a mathematically valid transaction on stylistic
or preferential grounds.

### Amount Storage — Phase 3 Resolution
The Phase 2 core stores amounts as standard JavaScript numbers, which are
IEEE 754 floating-point. This introduces the classic 0.1 + 0.2 !== 0.3
problem on non-integer values. For Phase 2 (whole-dollar, in-memory only)
this is acceptable. In Phase 3, when persistence is added, all amounts
will be stored as integers representing the smallest currency unit (e.g.
cents for USD). Conversion to and from integer representation occurs at
the boundary between the engine and the database layer, never inside the
core engine itself.

---

## Security Architecture

### Threat model and implemented controls

CoreBooks operates in two modes with distinct attack surfaces.

**Local / SQLite mode (default)**
- The Fastify API binds to `127.0.0.1` only — not reachable from the network.
- SQLite is a plain file on the user's machine. The primary threats are
  physical theft and OS-level compromise, not remote network attacks.

**Multi-user / PostgreSQL mode (opt-in)**
- Data travels over the network. TLS is mandatory.
- `src/db/client.ts` emits a stderr warning when a PostgreSQL URL lacks an
  explicit `sslmode`. The `/settings/database` API route surfaces an
  `sslEnabled: boolean` field so the UI can show an amber warning banner.

### What is implemented

| Feature | Location | Status |
|---|---|---|
| API bound to loopback only (`127.0.0.1`) | `src/api/bootstrap.ts` | Complete |
| PostgreSQL SSL validation (warning + UI banner) | `src/db/client.ts`, `src/api/routes/settings.ts`, `src/ui/pages/SettingsPage.tsx` | Complete |
| safeStorage key generation (OS keychain via Electron) | `src/electron/main.ts` | Complete — key exists in `COREBOOKS_DB_KEY`, database not yet encrypted |
| Encrypted export (AES-256-GCM + PBKDF2) | `src/ui/lib/crypto.ts`, `src/ui/components/ExportPasswordModal.tsx` | Complete |

### SQLCipher — the open gap and how to close it

The at-rest encryption key is generated on first launch by
`getOrCreateEncryptionKey()` in `src/electron/main.ts` and stored via
`safeStorage` (OS keychain). It is surfaced as `process.env['COREBOOKS_DB_KEY']`.
The hook point in `src/db/client.ts` shows exactly where to apply it.

**Why the database is not yet encrypted:** `PrismaBetterSqlite3` creates the
`better-sqlite3` Database instance internally (see
`node_modules/@prisma/adapter-better-sqlite3/dist/index.d.ts`). It accepts
`Options & { url: string }` — there is no constructor overload accepting a
pre-created Database instance, so there is no place to run
`db.pragma("key = '...'")` before Prisma opens the file.

**How to complete it when unblocked:**
1. Replace `better-sqlite3` with a SQLCipher-enabled fork:
   `npm install better-sqlite3-sqlcipher` (and uninstall `better-sqlite3`).
2. Create a custom Prisma driver adapter (or wait for Prisma to add official
   SQLCipher support) that accepts an already-opened Database instance.
3. In `src/db/client.ts`, inside `createPrismaClient()`, instantiate the
   database, apply the PRAGMA key from `process.env['COREBOOKS_DB_KEY']`, and
   pass it to the adapter.
4. Run the migration SQL (`src/db/ensureSchema.ts`) against the now-encrypted
   database on first launch.
5. Existing plain databases must be re-encrypted on upgrade. The standard
   SQLCipher approach is `ATTACH DATABASE ... KEY ...; SELECT sqlcipher_export(...)`.
6. Add a test that opens the raw `.db` file as text and asserts it does NOT
   contain plaintext account names (proving encryption is active).

The key infrastructure is already in place. Steps 1–3 are the blocker.

### Encrypted export format

Exported files use this self-describing JSON envelope:

```json
{
  "v": 1,
  "algo": "AES-256-GCM",
  "kdf": "PBKDF2",
  "hash": "SHA-256",
  "iter": 600000,
  "salt": "<base64 32 bytes>",
  "iv":   "<base64 12 bytes>",
  "ct":   "<base64 ciphertext + 16-byte GCM auth tag>"
}
```

`iter` is stored explicitly so future versions can increase the work factor
without breaking older backups. A decryption tool must read `iter` from the
file, not assume a hardcoded value.

---

## Future Feature Ideas (Backlog)

These are features that have been discussed but not yet planned or scoped.
Before implementing any of them, do a design conversation with the user to
agree on scope, data model changes, and which phase they belong to.

### Onboarding Questionnaire (replaces FirstLaunchModal)

Replace the current one-step `FirstLaunchModal` with a multi-step setup
wizard shown on first launch. Goals:

- Collect business name (already collected today; carry this forward).
- Ask a short set of business-type questions (freelancer, product business,
  service business, etc.) to suggest which feature modules to enable.
- Show a checklist of optional modules (AR/AP manager, inventory, etc.) so
  the user can toggle them on or off at first launch.
- Include a persistent **Skip** button on every step that closes the wizard
  immediately and applies sensible defaults. Users can revisit all settings
  later in Settings.
- Store answers in `localStorage` (same pattern as existing keys like
  `cb_company_name` and `cb_welcomed`).

**Implementation notes:**
- The wizard is purely a UI concern — no new API routes or DB columns needed
  for the questionnaire itself. Feature-flag toggles live in `localStorage`.
- Feature flags control which nav items and pages are visible in the sidebar.
  A disabled module is hidden entirely, not just grayed out.
- This should be built before any new modules (AR/AP, inventory) so the
  toggle infrastructure is ready when those modules land.

---

### Accounts Receivable / Accounts Payable Manager

Track money owed to the business (AR) and money owed by the business (AP)
against named customers and vendors. AR and AP accounts already exist in the
chart of accounts; this module adds the entity layer on top.

**What it needs:**
- New DB models: `Customer` and `Vendor` (name, contact info, terms).
- New DB model: `Invoice` (linked to customer or vendor, due date, line
  items, total amount, status: open / partially paid / paid).
- Payment-matching: record a payment against an invoice and auto-generate
  the journal entry (debit cash, credit AR — or the AP mirror image).
- New UI pages: Customers list, Vendors list, Invoices list with aging view
  (30 / 60 / 90 day buckets).
- New API routes under `/customers`, `/vendors`, `/invoices`.

**Architectural constraint:** Invoice creation must auto-post a balanced
journal entry through the existing entry engine. The AR/AP module never
writes directly to the ledger — it calls the same `postEntry` path that the
rest of the app uses.

**Implementation order:** Onboarding questionnaire → AR module → AP module
(AR first because receivables are usually more time-sensitive for small
businesses).

---

### Inventory Management

Track physical goods: item catalog, quantities on hand, and cost of goods
sold (COGS) accounting. This is the most complex module on the backlog.

**Minimum viable scope:**
- New DB model: `InventoryItem` (SKU, name, unit of measure, unit cost,
  quantity on hand).
- Receive goods: increase quantity, auto-post a debit to an Inventory asset
  account and a credit to AP (or cash).
- Sell goods: decrease quantity, auto-post COGS debit + Inventory credit.
- Inventory valuation report: total value of stock on hand at cost.

**Out of scope for first iteration:** FIFO/LIFO/weighted-average costing
selection, multi-location warehousing, reorder points, and barcode scanning.
Keep the first iteration to the minimum needed to close the accounting loop.

**Gating condition:** Only build this after AR/AP is solid, and only if the
onboarding questionnaire confirms the user is a product-based business.
Service businesses and freelancers should never see inventory in their UI.

---

### PostgreSQL Migration Wizard (Settings → Database)

A guided in-app wizard that walks the user through switching from SQLite to
PostgreSQL for multi-user / multi-employee setups.

**Steps the wizard should cover:**
1. Explain in plain language when PostgreSQL is the right choice.
2. Accept a connection string and validate it (test the connection before
   committing).
3. Export current SQLite data to a JSON snapshot.
4. Run migrations against the new PostgreSQL database.
5. Import the JSON snapshot into PostgreSQL.
6. Update the stored connection config and restart the API server in-process.

**Note:** "Schema" and "adapter" must never appear in user-facing wizard text.
Plain language only (e.g., "We'll copy your data to the new database").

---

### Payment Methods Management (Settings → Payment Methods tab)

A third tab in Settings where users manage the list of payment methods
available when creating a journal entry (cash, check, ACH, credit card, etc.).

**Current state:** `NewEntryModal` has a free-text payment method field.
This tab should replace free text with a user-managed dropdown, persisted
either in `localStorage` or via a new `/settings/payment-methods` API route.

**This is the smallest item on the backlog and a good warm-up before the
larger modules above.**