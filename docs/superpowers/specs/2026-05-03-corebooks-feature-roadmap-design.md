# corebooks feature roadmap design

**Date:** 2026-05-03
**Status:** Approved

---

## product vision

corebooks is the minecraft of accounting. the core is a pristine double-entry accounting engine — the physics of money. everything else is built on top of it. users start with a blank world and build exactly what they need. plugins (when built) extend the world with new mechanics. nothing is forced; everything is opt-in.

**the three pillars:**
1. **privacy-first, local-first** — data never leaves the user's machine unless they choose it. no telemetry, no cloud accounts, no vendor lock-in. ever.
2. **foss** — fully auditable, community-driven, free forever. every design decision should ask: would a community contributor be proud to build this?
3. **grows with the user** — sqlite for solo users (zero config), postgresql for teams (multi-user, role-based). the same software serves both.

**the funnel:** modern UI and unique features earn attention. painless migration from quickbooks/wave/xero closes the deal.

---

## section 1 — navigation & shell

### sidebar structure

```
[logo]                      ← clicking navigates to Home

🏠 Home                     ← standalone, always top

▾ LEDGER
    Chart of Accounts
    Entries
    Drafts

▾ REPORTS                   ← only user-pinned reports appear here
    Trial Balance            ← pinned by default
    Balance Sheet            ← pinned by default
    Income Statement         ← pinned by default
    [additional pinned]
    Browse all reports...    ← opens Reports Library page

▾ EXTRA WORKFLOWS
    Recurring
    Close Period

▾ PLUGINS                   ← section only renders when a plugin is installed
    [plugin nav items]

⚙                           ← settings cog, pinned to bottom
```

**rules:**
- each collapsible section has a chevron toggle; state persists in `localStorage`
- badge counts (e.g. "3" on Drafts) live on the nav item contributed by the owning page
- the `+ New Entry` button lives in the top toolbar (right side), always visible
- plugin nav items declare which group they belong to in their manifest; unspecified items land in PLUGINS

### top toolbar

```
[logo]  [business name]  [search bar]  [+ New Entry]
```

- clicking the logo or business name navigates to Home
- the search bar sits to the right of the business name (see Section 4); the shell (ghost input) is added in Phase 2, functionality in Phase 8
- `+ New Entry` is always present, regardless of current page

### settings cog animation

- resting state: cog icon only, no label
- on hover: cog rotates 45° (1/8 turn), "Settings" text slides in left-to-right
- on mouse-out: both animations reverse
- implemented with css transitions; no js required

### pinned reports star

- each report in the Reports Library has a ⭐ pin toggle
- pinned state: neon blue `#00d4ff`
- "zaps in" animation on selection: quick scale punch (0 → 1.3 → 1.0) + brightness flash
- unpinned state: muted ash `#7d8a9e`
- default pinned on first launch: Trial Balance, Balance Sheet, Income Statement

### welcome messages

the home page picks one of N all-lowercase messages at random on each mount. add to the existing pool:

> `"we are the minecraft of accounting."`

---

## section 2 — core feature depth

### 2.1 recurring transactions

**new prisma model: `RecurringTemplate`**

```
id             cuid
name           String
memo           String
paymentMethod  String?
schedule       Enum: weekly | monthly | quarterly | annually | custom
customCron     String?        -- only used when schedule = custom
nextDue        DateTime
autoPost       Boolean        -- default false
lines          RecurringLine[]
createdAt      DateTime
updatedAt      DateTime
```

**`RecurringLine` model mirrors `JournalLine`:**

```
id          cuid
templateId  String
accountId   String
type        debit | credit
amount      Int             -- cents
```

**behavior:**
- on app launch and once per day, electron checks for templates where `nextDue <= now`
- if `autoPost = false`: creates a draft and sends a toast notification
- if `autoPost = true`: posts the entry directly
- after firing, `nextDue` is advanced by one schedule interval
- lives under Extra Workflows → Recurring

**UI:**
- table of active templates with columns: name, schedule, next due, auto-post badge, edit/delete
- New Template button reuses the entry form modal with a schedule picker appended at the bottom

---

### 2.2 period close & closing entries

**never automatic. always user-initiated.**

**settings → accounting: period configuration**

users define:
- **fiscal year end** — any month + day (default: December 31)
- **close frequency** — Year-end only | Month-end + Year-end
- **retained earnings account** — user selects from existing equity accounts

this section only appears after at least one equity account exists.

**extra workflows → close period: period status board**

a table of all periods since the fiscal year start, each showing:

| Period | Status | Action |
|---|---|---|
| Jan 2025 | Closed | View |
| Feb 2025 | Closed | View |
| Mar 2025 | Ready to Close | Close → |
| Apr 2025 | Open | — |

status logic:
- **Open** — current or future period, no action available yet
- **Ready to Close** — period end date has passed and all entries are posted
- **Closed** — closing entry has been posted for this period

**closing flow:**
1. user clicks Close → on a ready period
2. system generates a draft closing entry: debit each revenue account its full period balance, credit each expense account its full period balance, net difference to Retained Earnings
3. user reviews the draft in the standard entry modal (read-only lines, visible amounts)
4. user posts it — this locks the period
5. locked periods reject new entries unless an admin uses an explicit override (confirmation modal)

month-end close uses the same flow but only closes revenue/expense into a temporary "Monthly Net Income" Equity account (credit normal balance), not directly to Retained Earnings — that happens at year-end when all Monthly Net Income balances roll into Retained Earnings. this account is auto-created when the user first configures month-end close frequency. if the user configured year-end only, month-end close is not available.

---

### 2.3 bulk operations

multi-select pattern with floating action bar. checkboxes appear on row hover; a sticky bar slides up from the bottom when any rows are selected showing count + available actions. `Esc` or clicking away clears selection.

| Page | Available bulk actions |
|---|---|
| Drafts | Post all selected, Delete all selected, Export selected |
| Entries | Export selected, Reverse all selected |
| Chart of Accounts | Change classification (current ↔ non-current) on selected accounts |

---

### 2.4 keyboard shortcuts

stored in `localStorage` as a JSON map. user-remappable via Settings → Shortcuts (click-to-record input; conflicts flagged in amber).

**default bindings:**

| Action | Default |
|---|---|
| New entry | `Cmd/Ctrl + N` |
| Save draft | `Cmd/Ctrl + S` |
| Post entry | `Cmd/Ctrl + Enter` |
| Close modal / deselect | `Esc` |
| Global search | `/` |
| Go to Home | `Shift + H` |
| Go to Entries | `Shift + E` |
| Go to Accounts | `Shift + A` |
| Go to Drafts | `Shift + D` |
| Go to Recurring | `Shift + R` |
| Pin/unpin current report | `Shift + P` |
| Open Close Period | `Shift + C` |

**rule:** `Cmd/Ctrl` = do something. `Shift` = go somewhere. `Esc` and `/` are exceptions.

a new **Shortcuts** tab is added to the Settings page.

---

### 2.5 account template library

a static JSON file shipped with corebooks (~40–50 common accounts). no network call; no privacy concern.

**three entry points:**

1. **Chart of Accounts page** — "Browse Library" button next to "New Account". opens a drawer organized by account type. each row shows: suggested number, name, type, normal balance, classification, plain-language description. `ADD+` per row; "Add All in Section" per group. added accounts are fully editable.

2. **Onboarding Wizard — Step 3** — after business type is selected, the wizard presents a curated subset relevant to that type. checkboxes, nothing pre-checked, Add Selected button.

3. **Settings → Accounts** — a "Library" sub-section shows all template accounts filtered to those not yet added, with `ADD+` per row.

**sample library (abbreviated):**

| # | Name | Type | Normal | Classification | Notes |
|---|---|---|---|---|---|
| 1000 | Cash | Asset | debit | current | |
| 1010 | Checking Account | Asset | debit | current | |
| 1200 | Accounts Receivable | Asset | debit | current | |
| 1500 | Equipment | Asset | debit | non-current | |
| 1510 | Accumulated Depreciation | Asset | credit | non-current | contra asset |
| 2000 | Accounts Payable | Liability | credit | current | |
| 2100 | Accrued Liabilities | Liability | credit | current | |
| 3000 | Owner's Equity | Equity | credit | — | |
| 3100 | Retained Earnings | Equity | credit | — | |
| 3200 | Owner's Draw | Equity | debit | — | contra equity |
| 4000 | Sales Revenue | Revenue | credit | — | |
| 4100 | Service Revenue | Revenue | credit | — | |
| 5000 | Cost of Goods Sold | Expense | debit | — | |
| 5100 | Wages Expense | Expense | debit | — | |
| 5200 | Rent Expense | Expense | debit | — | |
| 5300 | Utilities Expense | Expense | debit | — | |
| 5400 | Depreciation Expense | Expense | debit | — | |

full library defined in `src/ui/lib/accountTemplates.ts`.

---

## section 3 — plugin system

**deferred.** the full plugin specification (manifest format, permission scopes, API contract, marketplace) is documented at `github.com/corebooks-app/plugins`. implementation is not scheduled in the current roadmap.

the open question of whether AR/AP should be a core feature or a plugin is explicitly unresolved. this decision should be made before plugin infrastructure work begins.

---

## section 4 — global search

**two surfaces:**

1. **toolbar search bar** — persistent input in the top toolbar, right of the business name. clicking focuses it. visually minimal (ghost style, placeholder "search...").

2. **command palette overlay** — pressing `/` or clicking the toolbar bar opens a centered full-overlay command palette. keyboard-navigable with arrow keys; `Enter` navigates to the result; `Esc` closes.

**search scope:**
- accounts — by name and account number
- entries — by memo, date, amount
- reports — by report name (navigates to that report)

results are grouped by type (Accounts / Entries / Reports) with a count per group. no backend changes required — queries existing API endpoints with debounced search term.

---

## section 5 — multi-user & roles

**postgresql mode only.** sqlite is always single-user, no auth. the local-first sandbox stays frictionless for solo users.

### roles

| Role | Capabilities |
|---|---|
| **Viewer** | Read all pages and reports, export data |
| **Bookkeeper** | Everything Viewer can do + create/edit drafts, post entries |
| **Admin** | Everything Bookkeeper can do + manage accounts, close periods, wipe data, manage users, override locked periods |

### role assignment rules

- **Viewer** and **Bookkeeper**: any number of users can hold these roles. any existing Admin can assign them freely.
- **Admin**: one Admin is created by default (the account owner who completed the PostgreSQL setup wizard). multiple Admins can exist — but promoting a user to Admin requires:
  1. the existing Admin initiates the promotion
  2. a confirmation modal explains the implications ("this user will have full control of all data and settings")
  3. the existing Admin re-enters their password to confirm
  4. the promoted user receives an in-app notification on next login

this prevents accidental admin escalation while allowing intentional delegation.

### auth

- session-based, email + password
- no oauth, no external dependencies — local-first principle holds in multi-user mode
- owner account created during the postgresql setup wizard (Settings → Database)
- `User` model added to prisma schema with fields: `id`, `email`, `passwordHash`, `role`, `createdAt`

---

## section 6 — build order

| Phase | What ships |
|---|---|
| **1** | Commit uncommitted files: import service, ImportModal, OnboardingWizard, featureFlags, paymentMethods |
| **2** | Navigation overhaul: flexible sidebar, pinned reports + star animation, settings cog animation, logo → Home link, search bar shell (ghost input, no functionality yet), welcome message addition |
| **3** | Recurring transactions (model + UI) |
| **4** | Period close configuration + Period Status board + closing entry workflow |
| **5** | Bulk operations on Drafts, Entries, Accounts pages |
| **6** | Keyboard shortcuts system + Settings → Shortcuts tab |
| **7** | Account template library (static JSON + drawer + onboarding integration) |
| **8** | Global search (toolbar bar + command palette overlay) |
| **9** | Multi-user roles (PostgreSQL path: User model, auth, role assignment, admin promotion flow) |
| **TBD** | AR/AP Manager — core feature vs plugin decision pending |
| **TBD** | Plugin infrastructure — deferred until AR/AP decision is made |

---

## constraints (always active)

- `src/core` remains dependency-free. no changes to core to accommodate any of the above.
- all amounts in the UI are dollars. the mapper layer handles cent conversion. no UI component multiplies or divides by 100.
- the local-first principle is non-negotiable. no feature may introduce a required network call. optional network calls (e.g. exchange rate APIs, plugin registry fetch) must be clearly opt-in and disableable.
- no tax-related features in the core. tax is a future plugin.
- multi-currency is a future plugin.
