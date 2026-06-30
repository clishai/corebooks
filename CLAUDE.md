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

### Vault Structure (Phase 10 — complete)

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
- Database: SQLite via Prisma 7 + custom `SqlCipherAdapterFactory` backed by `better-sqlite3-multiple-ciphers` (SQLCipher); PostgreSQL opt-in
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
- **Security**: API loopback-only; PostgreSQL SSL warning; encrypted export (AES-256-GCM + PBKDF2 600k iterations) via `src/ui/lib/crypto.ts`; `safeStorage` key infrastructure in `src/electron/main.ts`; SQLCipher full database encryption complete (Plan F).

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

- `src/ui/hooks/useSearch.ts` — debounced (200 ms) search across accounts, entries, and reports. Guards against stale async results, clears old matches while loading, and reports API failures instead of showing stale data.
- Entry search results navigate to `/entries?preset=all-time&entry=...` so older entries are visible and expanded instead of hidden by the default month filter.
- `src/ui/components/CommandPalette.tsx` — modal overlay; keyboard-navigable (↑/↓/Enter/Esc), terminal-style prompt, result type labels, loading/error states, and kbd footer hints.
- Toolbar search bar is now a button that opens the palette. It displays the current rebindable `global-search` shortcut from `src/ui/lib/shortcuts.ts`.
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

### Phase 10 — Vault Architecture (complete)

**Files added/changed:**
- `src/electron/vaultTypes.ts` — `VaultEntry`, `VaultState`, `VaultMetadata`, `VaultRegistry` shared types.
- `src/electron/vaultManager.ts` — registry I/O (`userData/vaults.json`), vault creation (mkdir + `.corebooks` metadata + subdirs), rename (updates metadata + renames folder on disk + updates registry), list, select.
- `src/electron/main.ts` — vault-aware startup: window created immediately (no API yet), full IPC surface for vault operations, `DATABASE_URL` set from vault path after selection, `startApiForVault()` replaces the old `startApi()`.
- `src/electron/preload.ts` — `apiBaseUrl` is null until vault selected (sync `vault:getState` IPC); exposes `vault` namespace including `relaunch()`.
- `src/ui/electron.d.ts` — updated to reflect nullable `apiBaseUrl` and full `vault` namespace.
- `src/ui/pages/VaultPickerPage.tsx` — full-screen launch page when `apiBaseUrl` is null. Grid of vault cards, "New vault" inline form, "Open existing…" folder picker.
- `src/ui/App.tsx` — `VaultGate` wraps everything; shows `VaultPickerPage` in Electron until vault is selected.
- `src/ui/pages/SettingsPage.tsx` — vault tab: rename, Show in Finder, Switch vault (calls `vault.relaunch()` → `app.relaunch() + app.exit(0)`).

**IPC surface:** `vault:getState` (sync), `vault:list`, `vault:create`, `vault:select`, `vault:rename`, `vault:showInExplorer`, `vault:chooseDirectory`, `vault:relaunch`.

**What does NOT change:** `src/core/`, `src/db/`, `src/api/` routes/middleware/bootstrap — all untouched.

**Vault rename flow:** Settings → rename → `vault:rename` IPC → folder renamed on disk + registry updated → `app.relaunch()` → vault picker shows → one click to open renamed vault.

**Switch vault flow:** Settings → Switch vault → `vault.relaunch()` IPC → `app.relaunch() + app.exit(0)` → fresh process → `vaultManager.current` is null → vault picker shows. Full restart is required because the Prisma client singleton cannot be re-pointed to a different database in the same process.

**Web/Vite dev mode:** `window.electronAPI` is undefined — vault picker never renders, app works as before.

---

### Phase 11 — Vault File Sync + Ollama AI Infrastructure (complete)

**Vault file sync:**
- `src/electron/vaultWatcher.ts` — `VaultWatcher` class (chokidar, depth 1 across all four vault subdirs) + exported `classifyFile(vaultPath, filePath)` pure function. Classification: `imports/` → `'import'`, importable extensions in other subdirs → `'misplaced'`, non-importable → `'filed'`. `'filed'` fires no event.
- `main.ts` additions: `VaultWatcher` lifecycle tied to `startApiForVault`, 5 new IPC handlers (`vault:listImports`, `vault:listVaultFiles`, `vault:moveFile`, `vault:deleteFile`, `vault:readFile`), `ollama:start` IPC for spawning Ollama, `vault:safeStorageAvailable` IPC.
- Vault file IPC validates paths against the selected vault and restricts move targets to `imports`, `statements`, `receipts`, or `exports`.
- `preload.ts` / `electron.d.ts` updated with full new IPC surface. File-event subscriptions return cleanup functions; React callers must unsubscribe in effect cleanup.
- `src/ui/components/ActionToast.tsx` — toast component with action buttons (separate from the simple `Toast` component). Used for vault file notifications.
- `Layout.tsx` additions: subscribes to `vault:file-added` / `vault:file-removed` IPC events; maintains `pendingImportCount`; shows `ActionToast` for import-ready and misplaced-file events; renders `ImportModal` with `preloadFile` when vault import triggered; AI panel `<aside>` alongside `<main>`; `AIButtonPopover` in toolbar; 60-second Ollama background ping + focus-based re-check.
- `ImportModal` gains optional `preloadFile?: { name, path, text }` prop — skips Step 1 when provided, opens on column-mapping (CSV) or options (JSON/IIF); adds post-import archive prompt (Move to statements/ / Leave / Delete) when preloadFile is set.
- `VaultTab` gains collapsible "Vault contents" panel — lists files from all four subdirs with Import/Move/Delete actions per row.
- `DatabaseTab` shows a numeric badge on the Import Data button when files are pending in `imports/`.

**Settings changes:**
- `HomeTab.tsx` deleted; replaced by `GeneralTab.tsx`. Tab label: `home` → `general`. "Alert reminders" section relabeled "Reminder frequency" — now explicitly the global setting for all app reminders. Default tab for Settings changed from `'home'` to `'general'`.
- `SettingsPage` Tab type gains `'ai'`; `'general'` replaces `'home'`. Tab order: vault · general · accounts · payment-methods · accounting · shortcuts · **ai** · users · database · reports.

**Ollama AI infrastructure and boundaries:**
- `src/ui/lib/ollama.ts` — `checkOllama(endpoint)`, `getOllamaConfig()`, `saveOllamaConfig(partial)`, `normalizeLocalOllamaEndpoint()`, `isLocalOllamaEndpoint()`, and `AI_MAY_POST = false`. localStorage keys: `cb_ai_enabled`, `cb_ai_endpoint`, `cb_ai_model`.
- Ollama endpoints are localhost-only (`http://localhost`, `http://127.0.0.1`, or loopback IPv6) with no path, credentials, query, or hash. Do not add remote/LAN model endpoints without an explicit design conversation and data-flow warning.
- `src/ui/pages/settings/AITab.tsx` — disabled state shows setup guide (install Ollama, `ollama pull llama3.2`); enabled state shows connection status, ghost Refresh button, endpoint validation, debounced re-check, and model dropdown.
- `src/ui/components/AIButtonPopover.tsx` — toolbar button with inline status dot. Click when AI disabled → popover: "not enabled" + Settings link. Click when AI enabled but offline → popover: "not activated" + Activate button (spawns `ollama serve` via Electron IPC). Click when connected → opens AI panel directly.
- `src/ui/components/AIPanel.tsx` — 320px right-side `<aside>`, connection status + model name, draft-only boundary copy, and "Configure AI →" footer link.
- `src/api/posting/authority.ts` + `src/types/posting.ts` define non-AI posting channels: `human`, `import`, `recurring`, `closing`, `reversal`. There is intentionally no `ai` channel.
- `src/api/services/postingService.ts` is the posting facade for official ledger writes. Future AI code must not import `postDraftEntry`, `postDraftWithAuthority`, `grantPostingAuthority`, or `reverseEntryWithAuthority`.
- Tests: `tests/api/postingAuthority.test.ts` verifies AI-shaped authority is rejected; `tests/api/aiPostingBoundary.test.ts` statically guards AI/Ollama modules from importing posting primitives.

**Cross-platform:**
- `@fontsource/jetbrains-mono` added; imported in `index.css` (weights 300/400/600). Font is now bundled in the Electron binary — no system font or CDN dependency.
- `vault:safeStorageAvailable` IPC added; `VaultTab` shows amber warning when OS keyring is unavailable (Linux without libsecret/GNOME Keyring/KWallet).
- `chokidar` added for cross-platform file watching (FSEvents/macOS, ReadDirectoryChangesW/Windows, inotify/Linux).

**Reference docs:**
- `docs/AI_BOUNDARIES.md` — detailed AI capability and posting-boundary design.
- `docs/FEATURE_IDEAS.md` — non-binding brainstorm for modules, plugin catalog, payroll, inventory, bank feeds, and smaller first-party ideas.

---

### Plan F — SQLCipher Full Database Encryption (complete)

Every vault's `corebooks.db` is encrypted at rest with SQLCipher (AES-256-CBC). The vault key K is a 32-byte value stored in `userData/.db.key` via `safeStorage`. For password-protected vaults K is also wrapped in `.corebooks` (password slot + BIP-39 recovery slot), so the database can be unlocked without touching the OS keychain.

**Key files added/changed:**
- `src/db/sqlcipherAdapter.ts` — Full TypeScript reimplementation of `@prisma/adapter-better-sqlite3` (based on v7.8.0), backed by `better-sqlite3-multiple-ciphers`. Constructor accepts an optional pre-opened `Database` instance so `PRAGMA key` can be applied before Prisma touches the file. Implements `SqlDriverAdapterFactory` from `@prisma/driver-adapter-utils`. Transaction serialized via `async-mutex`.
- `src/db/openDatabase.ts` — Opens a database file, applies `PRAGMA key = "x'<64-char-hex>'"` (raw key mode), and migrates plaintext databases to SQLCipher on first launch using `PRAGMA rekey`. Returns the keyed `Database` instance.
- `src/db/ensureSchema.ts` — Signature changed from `(dbPath: string)` to `(db: Db)`. Caller owns the connection lifecycle; no internal open/close.
- `src/db/client.ts` — `PrismaBetterSqlite3` removed. Now uses `SqlCipherAdapterFactory` + `openDatabase`. Exports `getOpenDb()` so `bootstrap.ts` can pass the already-opened instance to `ensureSchema`.
- `src/api/bootstrap.ts` — Calls `getPrismaClient()` (which opens and keys the DB), then `getOpenDb()`, then `ensureSchema(db)`. Single connection, no double-open.
- `src/electron/main.ts` — `getOrCreateEncryptionKey` guards against overwriting a key already set by `vault:unlock`; `vault:setupEncryption` wraps the OS-keychain key (not fresh random bytes, avoiding any re-encryption); `vault:select` returns `{ needsPassword: true }` for encrypted vaults without starting the API; new `vault:unlock` IPC derives K (Argon2id → AES-256-GCM unwrap) and then calls `startApiForVault`; auto-open skips password-protected vaults; `resetPasswordAfterRecovery` re-saves K to the OS keychain.
- `src/electron/preload.ts` / `src/ui/electron.d.ts` — `vault.unlock(password)` added to IPC surface; `vault.select` return type updated to include `{ needsPassword?: boolean }`.
- `src/ui/components/UnlockVaultModal.tsx` — Password prompt modal overlaid on VaultPickerPage. Single password input, inline error on wrong password, loading state, Escape to cancel.
- `src/ui/pages/VaultPickerPage.tsx` — Both the vault-card click path and "Open existing…" path check `result?.needsPassword` after `vault.select`; shows `UnlockVaultModal` when true.

**Key decisions:**
- `better-sqlite3-multiple-ciphers` (not `better-sqlite3-sqlcipher`) — actively maintained, based on better-sqlite3 12.x (API-compatible with the project). `sqlcipher_export` is unavailable in this build; `PRAGMA rekey` on a plaintext-opened connection is used for migration.
- K_os = K_vault — the OS-keychain key IS the vault key. No separate key per-slot avoids re-encryption when password is set or removed.
- Custom Prisma adapter rather than patching — the official adapter is CJS and cannot be patched in ESM TypeScript. Full reimplementation (~420 lines) is maintainable and pinned to v7.8.0.

**Tests:** `tests/db/sqlcipherAdapter.test.ts`, `tests/db/openDatabase.test.ts`, `tests/db/sqlcipherIntegration.test.ts` — 244 total tests passing. Security audit confirmed no key material in logs, error messages, or IPC responses.

---

## The Single Most Important Rule

**Never modify the core to accommodate an outer layer.**

The core is the accounting engine. It knows nothing about databases, screens, or external services. Everything else adapts to it — never the reverse.

**Acceptable precedent — `Ledger.reset()`:** Added for the data-wipe settings endpoint. It is a pure in-memory operation with no knowledge of why it is called. Test: could this method exist in a world with no database and no UI? If yes, it belongs in the core.

## Vault Isolation Principle

**Every vault is a fully self-contained unit. No vault-scoped data is ever shared across vaults.**

A vault represents one company's books. Anything that describes that company — name, fiscal year, currency, payment methods, feature flags, UI state for this vault, encryption material, audit log — lives **inside** the vault folder. Two vaults open on the same machine must look to the application as if they had never met. Users (e.g. fractional bookkeepers) may operate multiple vaults in a single day for different businesses; no setting, preference, or piece of state from vault A may ever leak into vault B.

**The only data the application may hold app-globally:**
- The launch picker's navigation hint list (paths + last-opened timestamps; no contents)
- User/device-personal preferences explicitly unrelated to any business's books (e.g. keyboard shortcuts)

Everything else is per-vault. localStorage, sessionStorage, and any file in `userData/` are NOT acceptable homes for vault-scoped data — that data must live in the vault's own `.corebooks/` metadata or in its database.

The current code still uses some localStorage keys (`cb_company_name`, `cb_flags`, `cb_payment_methods`) for vault-scoped data; these are slated to migrate into per-vault storage as part of the vault isolation overhaul. Do not add new app-global storage for vault-scoped data, and prefer per-vault homes for any new settings.

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
- Official posting requires an explicit non-AI posting authority. Valid channels are `human`, `import`, `recurring`, `closing`, and `reversal`.
- AI may suggest categorisation and draft entries only. AI must never call posting endpoints, receive a posting authority, mark drafts as `Posted`, create reversals, or bypass period locks/validation.
- Future AI services should return annotations or draft suggestions and save through the normal draft path. Human/system posting remains a separate action through `src/api/services/postingService.ts`.
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
| SQLCipher database encryption | `src/db/openDatabase.ts`, `src/db/sqlcipherAdapter.ts`, `src/db/client.ts` |
| safeStorage encryption key (`COREBOOKS_DB_KEY`) | `src/electron/main.ts` — lives in `userData`, NOT in vault |
| Password-protected vault unlock | `src/electron/main.ts` (`vault:unlock` IPC), `src/ui/components/UnlockVaultModal.tsx` |
| Vault password + BIP-39 recovery slots | `src/electron/main.ts` (`vault:setupEncryption`, `vault:unlock`, etc.), `<vault>/.corebooks` |
| Encrypted export (AES-256-GCM + PBKDF2) | `src/ui/lib/crypto.ts`, `ExportPasswordModal.tsx` |
| Session auth (PostgreSQL mode only) | `src/api/middleware/auth.ts`, `src/api/routes/auth.ts` |
| Vault registry | `userData/vaults.json` — list of known vault paths + last-opened timestamps |
| Vault metadata | `<vault>/.corebooks` — name, version, created date, encrypted key slots (no raw secrets) |
| AI posting boundary | `src/api/posting/authority.ts`, `src/api/services/postingService.ts`, `tests/api/aiPostingBoundary.test.ts` |

**Vault and key separation:** The vault folder (`<vault>/corebooks.db`, `<vault>/.corebooks`) contains no raw key material. The OS-keychain key (`userData/.db.key`) is intentionally outside any vault so vaults can be moved, copied, or backed up independently without compromising the encryption key. The `.corebooks` metadata file stores encrypted key slots (AES-256-GCM wrapped), never the raw key.

**AI data boundary:** Local AI is opt-in and currently limited to localhost Ollama. AI features may observe, explain, classify, and suggest drafts; they must not post official entries or receive a posting authority. Keep this policy outside `src/core`.

## Self-Review Checklist

1. **Stale data** — async flows may capture stale state; verify latest values are re-fetched.
2. **Type-check** — `npm run build` (server) and `npx tsc --project src/ui/tsconfig.json --noEmit` (UI). Zero errors.
3. **Edge cases** — empty lists, undefined optionals, zero amounts, missing IDs.
4. **Consistency** — follow existing patterns (error handling, naming, file layout).
5. **Onion rule** — no outer-layer change should touch `src/core/`.
6. **AI boundary** — any AI/Ollama change must remain draft-only and pass `tests/api/aiPostingBoundary.test.ts`.
7. **Fresh diff read** — re-read every changed line for logic inversions, off-by-one, wrong variables, silent no-ops.

## What NOT to Do

- Do not install packages into `src/core/`.
- Do not use `console.log` for error handling — use TypeScript error types.
- Do not skip tests for core functions.
- Do not make silent changes — always explain what changed and why.
- Do not store vault-scoped data (company name, fiscal year, currency, payment methods, feature flags, etc.) in localStorage, sessionStorage, or any file in `userData/`. It belongs in the vault's `.corebooks/` metadata or in its database. See the Vault Isolation Principle above.

## Potential Features

All new modules must gate sidebar items behind `src/ui/lib/featureFlags.ts`. Open a design conversation before building any of these.

**AR/AP Manager:** `Customer`, `Vendor`, `Invoice` models. Invoice creation creates reviewable drafts or posts only through an explicit non-AI posting authority — never writes directly to the ledger. Aging view (30/60/90 days). Gate: `isFeatureEnabled('ar_ap')`.

**Inventory:** `InventoryItem` (SKU, unit cost, qty on hand). Receive/sell goods can suggest or draft COGS entries; posting must go through the posting facade. First iteration: no FIFO/LIFO, no multi-location. Gate: `isFeatureEnabled('inventory')`. Likely a stronger first-party candidate than payroll because it shapes core accounting workflows.

**Import from Other Software:** CSV column mapping → draft entries for user review before posting. QuickBooks .IIF parsing. Fuzzy account name matching. Imports always create drafts, never auto-post.

**PostgreSQL Migration Wizard:** In-app guided wizard (Settings → Database) to move from SQLite to PostgreSQL. JSON snapshot export, migration, import. No "schema" or "adapter" in user-facing text.

**Bank Feed Import:** OFX/QFX/CSV bank statements → auto-match or create draft entries. Requires vault architecture (Phase 10) — statements land in `<vault>/imports/`, watched by the app, processed into the draft review queue. Imports always create drafts, never auto-post.

**AI-Assisted Categorisation (Ollama):** Optional built-in feature (not a plugin). If Ollama is running at `localhost:11434`, the bank import flow can request account categorisation suggestions for each transaction. Falls back gracefully to manual mapping if Ollama is absent. Configured in Settings → AI tab. AI output is draft-only and must never post entries.

**Plugin API / catalog:** Webhook or local extension interface for Stripe, Shopify, payroll providers, ecommerce, tax exports, and country/industry-specific integrations. Plugins should produce source documents, import files, or drafts by default; do not grant posting authority to plugins without a separate permission model.

**Payroll:** High compliance and jurisdiction-specific complexity make payroll a better plugin-catalog candidate before making it a first-party module.

**Multi-currency:** Foreign currency transactions with exchange rate tracking and unrealised gain/loss accounts.
