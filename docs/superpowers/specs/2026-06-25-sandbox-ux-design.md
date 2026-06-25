# corebooks — Sandbox UX & Security Design
**Date:** 2026-06-25  
**Status:** Approved, pending implementation plan

---

## Vision

corebooks should feel like Minecraft — a sandbox where the core rules are immovable but everything else is the player's canvas. The double-entry accounting engine (debits = credits, balances must hold) is the physics engine: sacred, untouched, never abstracted away. Everything built on top of it — navigation, features, workflows, appearance — is opt-in, customizable, and user-controlled.

**Design principles:**
- **Passive, not alive** — the app is a tool. It never nudges, suggests, or pushes users in any direction. No AI-driven guidance. No contextual pop-ups. It responds to what you do, it does not initiate.
- **Accounting language stays** — debits, credits, journal entries, chart of accounts. The app teaches accounting by doing it, not by hiding it. This makes it useful in classrooms and for self-learners.
- **Low floor, high ceiling** — a student can open a vault and record their first journal entry in minutes. A CFO at a company running PostgreSQL can have real-time Plaid sync, custom reports, and automated data flows. The app is the same app — it just grows.
- **Opt-in complexity** — every advanced feature is explicitly enabled by the user. Nothing appears uninvited. Disabling a feature hides it; deleting its data requires extreme friction.
- **Performance is flat** — the UI is a view layer over whatever storage exists. It does not get heavier as data grows. SQLite for individuals, PostgreSQL for organizations — the app looks and feels identical.

**Target users:**
- Small business owners switching away from QuickBooks
- Accounting students and classrooms learning double-entry bookkeeping
- Freelancers, consultants, nonprofits
- Technical power users who want full control over their financial data

---

## 1. Sidebar Redesign

### Structure
The sidebar has three fixed zones separated by divider lines:

```
┌─────────────────┐
│  ~/ corebooks   │  ← Logo (always visible)
│  Company name   │
├─────────────────┤
│                 │
│  [scrollable    │  ← All nav items (Home, Ledger, Reports,
│   nav items]    │    enabled Workflows, enabled Modules)
│                 │
├─────────────────┤
│  ⚙ Settings    │  ← Always visible, never scrolls away
├─────────────────┤
│      <<         │  ← Collapse/expand toggle, always at bottom
└─────────────────┘
```

The middle zone scrolls freely. Settings and the toggle are pinned outside the scroll container regardless of how many nav items are added.

### Collapse behavior
- **Expanded:** full text sidebar, `<<` at bottom
- **Collapsed:** icon rail only, `>>` at bottom
- Single-item destinations (Home, Settings) navigate directly on click when collapsed
- Section icons (Ledger, Reports, Workflows, Modules) slide the sidebar open and expand that section

### Logo treatment
Replace the existing `logo.png` with a live styled text lockup:
- `~/ corebooks` — all chalk (`#eef2f8`), JetBrains Mono weight 300
- Collapsed state: `~/` in the same treatment
- The PNG is retired from the sidebar (keep for external use: README, docs, app store)

### Navigation edit mode
Entered via Settings → Navigation → "Edit sidebar order" or `/open nav-edit`.

Rules:
- **Home** is always first, pinned — cannot be moved
- **Settings** is always last, pinned — cannot be moved
- **Sections move as a unit** — dragging the Ledger section handle moves Accounts, Entries, and Drafts together; children cannot be separated from their parent
- Items within a section can be reordered within that section only
- A violet border and "editing nav" banner make edit mode visually distinct — cannot be entered accidentally
- "Done" exits edit mode

---

## 2. Settings Restructure

Replace the current 10-tab flat layout with a **searchable left-rail** layout (VS Code style):

- Search bar at the top filters all settings in real time
- All categories listed in a left rail — no nesting, no dropdowns
- Clicking a category scrolls to that section in the main panel
- Every setting lives in exactly one place

**Category list (in order):**
- General (company name, date format, currency, reminder frequency)
- Navigation (sidebar position, item order, edit mode entry)
- Vault (vault management, rename, show in finder, switch vault)
- Ledger (accounts, payment methods, accounting rules)
- Shortcuts (rebindable keyboard shortcuts)
- **Features** (see section 3)
- AI (Ollama configuration)
- Users (PostgreSQL mode only)
- Database (SQLite/PostgreSQL, import data)
- Reports (pinned reports, custom views)
- Audit (read-only audit log)
- Plugins (future)

---

## 3. Capability Layers — Features Section

A dedicated **Features** category in Settings lists all opt-in capabilities as a card grid (2 columns). Each card shows:
- Feature name
- One-line description
- Hover reveals full description inline (no separate i-icon cluttering the row)
- **Add** button (inactive features) or **Enabled** badge + **Hide** button (active features)

### Three tiers

**Core — always on, toggles grayed out:**
- Chart of Accounts
- Journal Entries & Drafts

**Workflows — opt-in:**
- Recurring Entries
- Period Close
- Bank Feed & Import
- Reconciliation
- Bank Rules (auto-categorization rules for imports)

**Modules — opt-in:**
- AR / AP (invoices, bills, aging)
- Inventory (SKUs, unit cost, quantity on hand)
- *(Future: Plaid sync, custom reports, multi-currency)*

### Enabling a feature
Adds it to the sidebar under the correct section header. The section header appears automatically when the first feature in that group is enabled.

### Disabling vs. deleting

**Hide** (low friction):
- Feature disappears from the sidebar and all UI surfaces
- All data is fully preserved
- Re-enabling restores it instantly, exactly where it was left
- Available at any time from the feature card

**Delete data** (high friction):
- Only available after hiding first
- Red confirmation panel, typed confirmation (`delete bank-feed`), explicit warning that the action is logged to the audit trail
- Posted journal entries are never affected — those live in the core ledger and are permanently immutable
- Only the module's own records (import logs, inventory items, etc.) are deleted

### Feature lifecycle log

Stored at `<vault>/.corebooks/feature-log.json` — **outside** any feature's own tables. Append-only, never editable, never deletable, survives a full data wipe of any module.

Each event records: feature name, event type (`enabled` / `hidden` / `restored` / `data-deleted` / `re-enabled`), timestamp, user, and `last-sync-through` date at the moment of data deletion.

On reconnection after a data delete, the app reads `last-sync-through` and resumes from the next day — no duplicate imports, no phantom gaps. Any gap period between deletion and reconnection is surfaced explicitly to the user.

The log is visible read-only under Settings → Vault → Feature History. Not filterable, not exportable separately, not deletable — not even by an admin.

---

## 4. Command Palette — Slash Command System

The existing command palette gains a slash-command namespace. Plain search (no slash) works exactly as today.

Typing `/` enters command mode and shows available namespaces:

| Command | Purpose |
|---|---|
| `/go <destination>` | Navigate to any page or settings tab |
| `/new <entity>` | Create an entry, account, recurring template, etc. |
| `/open <modal>` | Open any modal or panel |
| `/set <feature> on/off` | Toggle any feature from the Features section |

Autocomplete narrows as you type. As features are enabled, their commands appear automatically — the namespace grows with the vault, not the codebase.

**Examples:**
- `/go accounts` → Chart of Accounts page
- `/go vault-picker` → vault picker (always available, regardless of 30-day skip)
- `/new entry` → opens New Entry modal
- `/new recurring-template` → opens Recurring Template modal
- `/open nav-edit` → enters sidebar edit mode
- `/set bank-feed on` → enables Bank Feed feature
- `/open vault-settings` → Settings → Vault

---

## 5. Onboarding Wizard — Redesigned

Four steps, shown on first launch of a new vault.

**Step 1 — Welcome**
- Vault/company name field
- One-liner: "open-source accounting for any business, any scale"
- No choices, no pressure — just name the vault and continue

**Step 2 — Business type**
Six options (grid layout):
- Sole Proprietor
- LLC / Partnership
- Corporation
- Nonprofit
- Learning / Practice *(for students and classrooms)*
- Other (I'll set everything up myself)

**Step 3 — Chart of accounts**
- Suggested account templates for the chosen business type
- All pre-selected but individually toggleable
- "Skip this step" available — no obligation
- Note: "More accounts available in the Account Library after setup"

**Step 4 — Ready**
Three neutral action choices (no default pushed):
- Create my first journal entry
- Browse the account library
- Take me to the home page (I'll explore on my own)

Footer note: "Additional features can be enabled at any time in Settings → Features." No feature is mentioned specifically — just awareness that it exists.

---

## 6. Vault Picker

Shown on **every launch**. The vault picker is the first screen after the app opens — before any vault data loads.

**Layout:**
- `~/ corebooks` wordmark at top
- List of all registered vaults with:
  - Vault name
  - File path
  - Last opened date
  - Lock badge (`open` or `protected`)
- Selected vault highlighted in neon border
- Double-click or select + Enter to open
- `+ New vault` and `Open existing…` buttons
- **"Don't show this screen for 30 days"** checkbox at the bottom

The vault picker is always accessible via `/go vault-picker` regardless of the 30-day skip.

---

## 7. Vault Password & Encryption

### Policy
- **No password set** → vault stored as plaintext SQLite, protected by OS disk encryption (FileVault / BitLocker) and file permissions. Settings → Vault displays: *"This vault is unencrypted — data is protected by your OS file permissions only."*
- **Password set** → vault encrypted with SQLCipher using a key derived from the password. The password is required on every vault open and on every export.

Vault passwords are **optional**. No password is not wrong — it is an informed choice. The UI is honest about what each option means.

### Encryption stack

| Layer | Choice | Reason |
|---|---|---|
| Key derivation | **Argon2id** | Memory-hard; GPU/ASIC cracking is vastly more expensive than PBKDF2 |
| Symmetric encryption | **AES-256-GCM** | Authenticated encryption; tamper-evident |
| Database encryption | **SQLCipher** | Encrypts the entire `.db` file at rest |
| Recovery phrase | **BIP-39, 12 words** | 128 bits of entropy; human-readable and verifiable |
| Package | `@scure/bip39` | MIT licensed, audited, used by Ethereum ecosystem |

The existing export encryption in `src/ui/lib/crypto.ts` (PBKDF2 + AES-256-GCM) is upgraded to Argon2id at the same time.

### Key slot architecture

The vault stores two independent key slots — not two keys, but two different encryptions of the **same** vault key K:

```
password       → Argon2id → slot A → unlocks K → AES-256-GCM → corebooks.db
recovery phrase → Argon2id → slot B → unlocks K → AES-256-GCM → corebooks.db
```

Either slot alone is sufficient to open the vault. Regenerating the recovery phrase replaces slot B only — K does not change, the database does not re-encrypt, the operation is instant regardless of vault size.

### BIP-39 recovery phrase flow

**Setup (shown once, never again):**
1. Display 12 numbered word tiles — `user-select: none`, copy/paste disabled on the screen
2. Green banner: *"Write this on paper right now. Do not screenshot. Store it somewhere physically separate from your computer."*
3. User clicks "I've written it down — verify me →"
4. Spot-check: 3 randomly chosen word positions, typed individually (no paste, autocorrect off, spellcheck off)
5. Pass → phrase is stored; fail → return to step 1

**Recovery (forgotten password):**
- All 12 words entered individually in numbered fields (no paste)
- Words validated against BIP-39 wordlist as typed — red border on unrecognized words
- On success: vault unlocked, user prompted to set a new password immediately

**Regeneration (from Settings → Vault):**
- Requires current vault password to confirm
- Amber warning: old phrase stops working immediately
- Generates new 12-word phrase, runs through same display/spot-check flow
- Slot B replaced; vault data unaffected

### Export password gate
All exports — encrypted `.corebooks` format and plain CSV/JSON — require the vault password before proceeding. This prevents data extraction from an unattended unlocked session.

### Emergency total-loss guidance
If both the vault password and recovery phrase are lost, the encrypted vault is mathematically unrecoverable by anyone. This is by design.

Mitigation: Settings → Vault includes a prominent **"Export vault as plain file"** button with explanatory text encouraging users to keep regular unencrypted exports stored somewhere physically separate from the device and the recovery phrase.

---

## 8. Home Page — Chart Options

The existing home page (welcome message, metric cards, alert banners, recent entry) gains an optional **chart view** per metric card. Users can toggle a metric card between number view and trend chart view.

**Suggested chart types:**
- Cash balance over time (line chart)
- Revenue vs. expenses by month (bar chart)
- Net income trend (line chart)
- Equity growth (area chart)

Chart view is a per-metric toggle stored in the same `cb_home_layout` localStorage key. No new global state required.

---

## 9. SECURITY.md (required)

A `docs/SECURITY.md` file must be created documenting:
- The full encryption stack (Argon2id, AES-256-GCM, SQLCipher, BIP-39)
- The key slot architecture (password slot + recovery phrase slot)
- What "no password" means and what OS-level protections apply
- The no-backdoor, no-recovery policy and why it exists
- Links to the source files implementing each component
- Recommendation to keep regular plain-text exports as a total-loss safeguard

This file is the public-facing security commitment. Being open-source is the proof — anyone can read and audit the implementation. No third-party key publication is needed.

---

## Open questions / future work
- Home page chart library selection (Recharts vs. Victory vs. custom SVG)
- Plaid integration design (when Plaid sync feature is enabled)
- Custom report builder UI
- Multi-currency support
- SQLCipher adapter for Prisma (resolves the known gap in `src/electron/main.ts`)
