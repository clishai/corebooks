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

**Outstanding from Phase 3 — DB and API tests**
These were deferred and must still be written:
- DB tests (`tests/db/`) — use an in-memory or temp-file SQLite database,
  never the live `corebooks.db`.
- API tests (`tests/api/`) — use supertest against real Fastify routes with a
  test DB, not mocked repositories.

## Branding

### Mascot
The CoreBooks mascot is a **pangolin**. The pangolin icon appears in the
sidebar beside the logo. It is rendered as a simple SVG line illustration
using the neon blue accent color. Future phases may commission a more
detailed mascot illustration.

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

**Phase 4 — UI**

The React + Tailwind frontend is underway. The Vite 8 + React 19 + Tailwind v4
SPA lives in `src/ui/` and proxies API calls to the Fastify server on port 3000.

Run the app:
- `npm run dev:api` — starts the API server on port 3000 (uses `npx tsx`)
- `npm run dev:ui` — starts the Vite dev server on port 5173

### Phase 4 Scope

**Completed:**
- `src/ui/api/client.ts` — typed fetch wrappers for all API and report endpoints.
- `src/ui/components/Layout.tsx` — dark sidebar with pangolin mascot, lowercase
  bold "corebooks" logo, Reports nav section, neon blue "+" New Entry" toolbar button.
- `src/ui/components/NewEntryModal.tsx` — journal entry form (dark mode):
  date, memo, payment method, debit/credit line grid, live balance indicator,
  Save Draft and Post Entry actions.
- `src/ui/components/NewAccountModal.tsx` — create account form (dark mode);
  auto-sets normal balance based on account type.
- `src/ui/pages/AccountsPage.tsx` — chart of accounts table with dark-mode
  color-coded type badges and a New Account button.
- `src/ui/pages/EntriesPage.tsx` — posted entries table with expandable rows
  showing individual debit/credit lines (dark mode).
- `src/ui/pages/TrialBalancePage.tsx` — flat table of all accounts with raw
  debit/credit balances; shows balanced status.
- `src/ui/pages/BalanceSheetPage.tsx` — Assets / Liabilities / Equity totals
  with an `asOf` date picker.
- `src/ui/pages/IncomeStatementPage.tsx` — Revenue, Expenses, Net Income with
  `from` / `to` date range pickers.

- `src/ui/pages/DraftsPage.tsx` — Drafts table with Open (reopens modal pre-filled)
  and Delete (requires confirmation modal) actions.
- `src/ui/components/Toast.tsx` — bottom-right corner auto-dismiss notification.
- `src/ui/components/FirstLaunchModal.tsx` — one-time welcome modal shown on
  first launch (dismissed state stored in `localStorage`). Explains local-first
  storage and optional multi-user setup in plain language.
- Auto-save on modal close: if the New Entry modal is closed with content in the
  form, the draft is saved silently and the toast fires. Implemented in
  `NewEntryModal.handleClose`.
- `GET /entries/drafts` API route + `listDraftEntries` repository function.

**Still to build — begin here next session:**
1. **Phase 3 tests** — write `tests/db/` and `tests/api/` as described above.
2. **Settings → Database page** — show current DB type, path, and a guided
   PostgreSQL migration wizard.

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

The current terminal-based development setup (running `npm run dev:api` and
`npm run dev:ui` separately) is **developer/contributor workflow only**, not
the end-user experience. Users should never need to know what a terminal is.

**Phase 5 will wrap CoreBooks in Electron** — a framework that bundles
Chromium (the browser that renders the UI), Node.js (the runtime that runs
the API server), and SQLite (the database) into a single native application.
The Fastify API server will start automatically as a background process inside
the app. The user opens one window and sees the UI immediately.

The optionality to hook up a PostgreSQL server for multi-user setups
(businesses with multiple employees) remains a goal, but is always opt-in —
the app must be fully functional out of the box with zero server configuration.

Decisions that flow from this direction:
- SQLite is the right default. Do not deprioritize the SQLite path.
- Avoid hardcoding `localhost:3000` in the UI — the port will be
  dynamically assigned in the Electron shell.
- The API server must be startable programmatically (not just via a CLI
  command) so Electron can launch it in-process.
- File paths for the SQLite database should use the OS user-data directory
  (via Electron's `app.getPath('userData')`) in Phase 5, not a hardcoded
  project-folder path.

## Stack

- Language: TypeScript (strict mode)
- Runtime: Node.js
- Database: SQLite via Prisma 7 + `@prisma/adapter-better-sqlite3` (default);
  PostgreSQL supported by swapping the provider
- Frontend: React 19 + Vite 8 + Tailwind v4 (src/ui/)
- API: Fastify 5 + @fastify/sensible (src/api/)
- Testing: Vitest
- Package manager: npm
- **Phase 5 (planned):** Electron — bundles the full app into a downloadable
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