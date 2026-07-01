<p align="center">
  <img src="docs/logo-readme.png" alt="corebooks" width="480" />
</p>

# corebooks

> Open-source, self-hosted accounting and bookkeeping software. Built from first principles.

**corebooks** is a privacy-first alternative to cloud accounting platforms. Your financial data lives on your machine — never in someone else's cloud. Each set of books lives in a **vault**: a plain folder you own, name, and control. You can have as many vaults as you have companies, clients, or projects.

This is a project by a college accounting major. The goal is to build the ultimate community-led accounting tool — one that any business owner can download, run, and own completely. Advances in open-source tooling have made it possible for non-technical people to build the software they've always wanted, rather than being stuck with expensive, closed-source SaaS.

---

## Status

**v0.8.0 — Public Beta**

The accounting engine, database, REST API, and Electron desktop app are all functional and in daily use. This is pre-release software. The core workflows are solid; rough edges exist and features are still being added. Not yet code-signed — see installation notes below.

**What works today:**

- **Vault-based storage** — each company's books live in a named folder you own; pick or create a vault on every launch, with a password required each time
- **Vault encryption** — every vault database is encrypted at rest with SQLCipher (AES-256). A password adds a second layer: the database key is wrapped with Argon2id + AES-256-GCM and stored in vault metadata. A 12-word BIP-39 recovery phrase is generated as a fallback
- **Vault file sync** — drop files into `imports/`, `statements/`, `receipts/`, or `exports/` inside the vault folder and the app detects them instantly; misplaced files get a guided notification
- Chart of accounts with current/non-current classification, live balances, inline editing, and an account template library (42 common accounts)
- Journal entry creation with draft auto-save and payment method tracking
- Recurring transaction templates (weekly / monthly / quarterly / annually)
- **Period close** — generates closing entries that zero Revenue and Expense into Retained Earnings; user reviews the draft before posting; closed periods are locked
- Trial Balance, Balance Sheet (current/non-current sections), and Income Statement with per-account breakdowns
- **Reconciliation** — clear posted entries against bank statement line items
- **CSV import** — drag CSV files into `imports/` or use the Bank Feed page; imports always create drafts for review before posting
- Global search command palette searching across accounts, entries, and reports
- Configurable keyboard shortcuts with live rebinding and conflict detection
- Multi-user roles (Viewer / Bookkeeper / Admin) in PostgreSQL mode — SQLite is single-user with no login required
- Encrypted data export (AES-256-GCM + PBKDF2)
- Feature flag system gating optional modules (AR/AP, Inventory) as they ship

**Known rough edges / coming soon:**

- Vault password change and recovery phrase regeneration from inside the app
- OFX/QFX bank statement parsing (CSV works today)
- Code signing (unsigned builds require a one-time right-click → Open on macOS)
- Windows and Linux installers are built but less tested than macOS

---

## Getting Started (Developer Setup)

corebooks runs on your own computer. No account, subscription, or internet connection required.

### What you need

- **Node.js** v20 or newer — download at [nodejs.org](https://nodejs.org) (choose the LTS version)

No separate database software needed — corebooks uses SQLite, stored inside your vault folder.

### Installation

```bash
git clone https://github.com/clishai/corebooks.git
cd corebooks
npm install
npm run dev
```

Open `http://localhost:5173` in your browser. Both the API server and UI start together with `npm run dev`.

When you open corebooks as a desktop app for the first time, you will be prompted to create your first vault. Give it a name like "My Business" and pick a location. You can create additional vaults later for separate companies, clients, or projects.

### Updating

```bash
git pull
npm install
```

### Build the desktop app locally

```bash
npm run package
```

Produces a platform installer in `release/`. You will see an "unidentified developer" warning on macOS — right-click → Open to bypass it once. Code signing is deferred until a stable v1.0 release.

---

## For Businesses / Multi-user Setup

By default corebooks uses **SQLite** — a zero-configuration database stored in a single file inside your vault. This is ideal for individuals or small teams on one machine.

If multiple employees need to access corebooks simultaneously from different computers, connect to a **PostgreSQL** database on a shared server. PostgreSQL is free, open-source software.

When connected to PostgreSQL, corebooks activates session-based authentication with three role levels: **Viewer** (read-only), **Bookkeeper** (create and post entries), and **Admin** (full access, user management). Admins can add users and promote others from **Settings → Users**.

---

## Architecture

corebooks is designed like an onion. Each layer wraps the one before it without compromising the core.

| Layer | What It Does |
|---|---|
| **Core (Layer 1)** | Pure double-entry accounting engine. Chart of accounts, journal entries, general ledger, trial balance, financial statements. Zero external dependencies. |
| **Database (Layer 2)** | Persistence via Prisma. SQLite (default, SQLCipher-encrypted) or PostgreSQL (multi-user). Amounts stored as integer cents — the mapper layer is the only cent↔dollar boundary. |
| **API (Layer 3)** | Fastify REST API. Routes delegate to repositories; no accounting logic in routes. |
| **UI (Layer 4)** | React 19 + Tailwind v4. Cypherpunk dark theme, JetBrains Mono, spring-animated page transitions. |
| **Desktop (Layer 5)** | Electron wrapper — vault picker on every launch, SQLCipher encryption, vault password + BIP-39 recovery, cross-platform file watcher. Builds to .dmg / .exe / .AppImage. |

---

## Security & Privacy

### Local mode (SQLite — the default)

Your vault is a plain folder on your machine. The database (`corebooks.db`) lives inside it and is not reachable from the network — the Fastify API server binds to `127.0.0.1` only. The vault can be backed up by any tool that copies folders (Time Machine, iCloud Drive, rsync).

**At-rest encryption:** Every vault database is encrypted with SQLCipher (AES-256-CBC). A 32-byte vault key K is generated on creation and stored in `userData` on your device. Stealing the database file without also accessing your machine gains nothing.

**Vault password:** Adding a password wraps K with Argon2id (64 MiB, 3 iterations, 4 lanes) + AES-256-GCM. The wrapped key is stored in the vault's `.corebooks` metadata file alongside a 12-word BIP-39 recovery phrase. The recovery phrase lets you reset a forgotten password without losing data — write it on paper and keep it separate from your computer.

**Encrypted backups:** Settings → Database includes an **Encrypted Export** option using AES-256-GCM with PBKDF2-SHA256 key derivation (600,000 iterations). The output is a self-describing `.enc.json` file — algorithm, KDF parameters, salt, and IV are stored alongside the ciphertext.

### Multi-user mode (PostgreSQL)

**SSL is required.** Add `?sslmode=require` to your `DATABASE_URL`:

```
DATABASE_URL="postgresql://user:password@your-server:5432/corebooks?sslmode=require"
```

corebooks warns in the terminal and Settings UI if SSL is not detected.

### What corebooks does not do

- No telemetry, analytics, or error reporting. The app never phones home.
- No cloud storage. All data lives where you put it.
- No account, email, or registration required.

---

## Who This Is For

- Small business owners who want full control of their books
- Freelancers and sole proprietors
- Accounting students learning double-entry bookkeeping
- Developers who want a hackable, extensible accounting engine
- Privacy-conscious users who won't hand their financial data to SaaS platforms

## Tech Stack

- **Language:** TypeScript (strict mode)
- **Database:** SQLite by default (PostgreSQL for multi-user)
- **ORM:** Prisma 7
- **API:** Fastify 5
- **Frontend:** React 19 + Tailwind v4
- **Desktop:** Electron — builds to .dmg / .exe / .AppImage

---

## Potential Features

Community contributions are welcome on any of these. Open an issue first to align on design.

| Feature | Description |
|---|---|
| **Accounts Receivable / Payable** | Customer and vendor entities, invoice tracking, payment matching, aging reports. |
| **Inventory** | Item catalog, quantities on hand, COGS accounting. Gated behind feature flag until mature. |
| **OFX/QFX bank statement parsing** | CSV import works today; OFX/QFX is the natural next step for direct bank downloads. |
| **Import from other software** | Parse and import from QuickBooks, Wave, FreshBooks, or CSV exports. |
| **PostgreSQL migration wizard** | Guided in-app flow to switch from SQLite to a shared PostgreSQL server. |
| **Plugin API** | Webhook interface so tools like Stripe, Shopify, and payroll providers can push source documents and drafts. |
| **Multi-currency** | Foreign currency transactions with exchange rate tracking and unrealised gain/loss. |
| **AI-assisted categorisation** | Local-only AI (no API keys) to suggest account mappings during import. Draft-only — AI may never post to the ledger. |

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for how to get involved.

## License

[AGPL-3.0](./LICENSE) — Free to use, modify, and distribute. Modifications must remain open source.
