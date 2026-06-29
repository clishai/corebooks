<p align="center">
  <img src="docs/logo-readme.png" alt="corebooks" width="480" />
</p>

# corebooks

> Open-source, self-hosted accounting and bookkeeping software. Built from first principles.

**corebooks** is a privacy-first alternative to cloud accounting platforms. Your financial data lives on your machine — never in someone else's cloud. Each set of books lives in a **vault**: a plain folder you own, name, and control. You can have as many vaults as you have companies, clients, or projects.

This is a project by a college accounting major. The goal is to build the ultimate community-led accounting tool, one that any business owner can download, run, and own completely. Advances in AI and the open-source toolbelt have made it possible for non-technical people to build the software they've always wanted, rather than being stuck with expensive, closed-source SaaS.

---

## Status

🚧 **Active Development** — approaching v1.0

The accounting engine, database, REST API, browser-based UI, and Electron desktop app are all functional. The app uses JetBrains Mono Light throughout for a cypherpunk aesthetic and is fully navigable with spring-animated page transitions. It includes:
- **Vault-based storage** — each company's books live in a named folder you own; pick or create a vault on every launch; rename a vault from within the app and the folder renames on disk
- **Vault file sync** — drop files into your vault's `imports/`, `statements/`, `receipts/`, or `exports/` folders and the app detects them instantly (chokidar cross-platform watcher); misplaced files get a guided notification
- **Ollama AI (optional)** — built-in AI panel powered by a local Ollama instance; no API keys, no cloud; configure endpoint and model in Settings → AI; toolbar status dot shows connection in real time
- Multi-step onboarding wizard (business name, business type, account template suggestions)
- Chart of accounts with current/non-current classification, live balances, inline editing, configurable column visibility, and an account template library (42 common accounts)
- Journal entry creation with draft saving, auto-save, and payment method tracking
- Recurring transaction templates (weekly / monthly / quarterly / annually) with auto-post option
- **Period close workflow** — generates closing entries that zero out Revenue and Expense accounts into Retained Earnings; user reviews the draft before posting; closed periods are locked
- Trial Balance, Balance Sheet (Current/Non-current sections), and Income Statement with per-account breakdowns
- **Reconciliation** — clear posted entries against bank statement line items to verify books match
- **Bank feed import** — drag CSV/OFX files into `imports/` or use the Bank Feed page to create draft-only categorisation rules; imports always produce drafts for review before posting
- Global search command palette (press `/`) searching across accounts, entries, and reports
- Configurable keyboard shortcuts with live rebinding and conflict detection
- Bulk operations on entries and accounts (reverse, delete, set classification)
- Multi-user roles (Viewer / Bookkeeper / Admin) in PostgreSQL mode — SQLite stays single-user with no login required
- **Vault encryption** — every vault database is encrypted at rest with SQLCipher (AES-256). Optional vault password adds a second layer: the database key is wrapped with Argon2id + AES-256-GCM and stored in the vault metadata. A 12-word BIP-39 recovery phrase is generated as a fallback. Non-password vaults unlock transparently via your OS keychain (macOS Keychain, Windows DPAPI, Linux libsecret).
- Encrypted data export (AES-256-GCM + PBKDF2)
- Settings covering general reminders, account columns, payment methods, keyboard shortcuts, AI configuration, user management (PostgreSQL), database stats, JSON export, and data wipe
- Feature flag system gating optional modules (AR/AP, Inventory) as they ship

---

## Getting Started (Developer Setup)

CoreBooks runs on your own computer. No account, subscription, or internet connection required.

### What you need

- **Node.js** version 20 or newer — download it at [nodejs.org](https://nodejs.org) (choose the "LTS" version)

That is it. No separate database software needed — corebooks uses SQLite, a lightweight database stored inside your vault folder.

### Installation

```bash
git clone https://github.com/clishai/corebooks.git
cd corebooks
npm install
npm run dev
```

Open `http://localhost:5173` in your browser. Both the API server and the UI start together with `npm run dev`.

When you open corebooks for the first time (as a desktop app), you will be prompted to create your first vault — a folder on your machine where your books will live. Give it a name like "My Business" and pick a location. You can create additional vaults later for separate companies, clients, or projects.

### Updating

```bash
git pull
npm install
```

If the database schema changed in this update (rare — check the release notes), run:

```bash
npx prisma migrate deploy
```

### Build the desktop app locally (contributors)

`npm run package` compiles everything and produces a platform installer in `release/`. You will see an "unidentified developer" or "unknown publisher" warning when you open it — code signing is deferred until the v1.0 public release. To bypass: right-click → Open on macOS, or More info → Run anyway on Windows.

---

## For Businesses / Multi-user Setup

By default, corebooks uses **SQLite**, a zero-configuration database stored in a single file on your computer. This is ideal for individual users or small teams on one machine.

If your business needs **multiple employees to access corebooks simultaneously** from different computers, you can connect to a **PostgreSQL** database on a shared server. PostgreSQL is free, open-source software designed for exactly this.

Think of it this way: SQLite is a notebook you keep at your desk. PostgreSQL is a shared filing cabinet your whole team can access at the same time. The switch only makes sense if you have a server that is always on and reachable by your staff.

When connected to PostgreSQL, corebooks activates session-based authentication with three role levels: **Viewer** (read-only), **Bookkeeper** (create and post entries), and **Admin** (full access, user management). Admins can add users and promote others to Admin with password confirmation. All of this is managed in **Settings → Users**. A guided database setup wizard is available in **Settings → Database**.

---

## Vision

corebooks is designed like an onion. Each layer wraps the one before it without compromising the core.

| Layer | What It Does |
|---|---|
| **Core (Layer 1)** | Pure double-entry accounting engine. Chart of accounts, journal entries, general ledger, trial balance, financial statements. Zero external dependencies. |
| **Database (Layer 2)** | Persistence with SQLite (default) or PostgreSQL (business) via Prisma. Amounts stored as integer cents — the mapper layer is the only cent↔dollar boundary. |
| **API (Layer 3)** | Fastify REST API. Routes delegate to repositories; no accounting logic lives in routes. |
| **UI (Layer 4)** | React 19 + Tailwind v4 browser-based interface. Cypherpunk dark theme, JetBrains Mono, spring-animated page transitions. |
| **Desktop App (Layer 5)** | Electron wrapper — vault picker on launch, named vault folders, SQLCipher database encryption, `safeStorage` key management, optional vault password with BIP-39 recovery, cross-platform file watcher. Builds to .dmg / .exe / .AppImage. |

## Who This Is For

- Small business owners who want full control of their books
- Freelancers and sole proprietors
- Accounting students learning double-entry bookkeeping
- Developers who want a hackable, extensible accounting engine
- Privacy-conscious users who won't hand their financial data to SaaS platforms

## Tech Stack

- **Language:** TypeScript
- **Database:** SQLite by default (PostgreSQL available for multi-user setups)
- **ORM:** Prisma
- **API:** Fastify
- **Frontend:** React 19 + Tailwind v4
- **Runtime:** Node.js
- **Desktop:** Electron (complete — builds to .dmg / .exe / .AppImage via `npm run package`)

## Security & Privacy

Corebooks is designed with a clear threat model for each of its two operating modes:

### Local mode (SQLite —> the default)

Your vault is a plain folder on your machine. The database (`corebooks.db`) lives inside it.
Neither the folder nor the database is reachable from the network — the Fastify API server
binds to `127.0.0.1` only (loopback). The vault can be backed up by any tool that copies
folders (Time Machine, iCloud Drive, Dropbox, rsync). No special export step required.

**At-rest encryption:** Every vault database (`corebooks.db`) is encrypted with SQLCipher
(AES-256-CBC). On first launch, corebooks generates a 256-bit key and stores it in your
OS credential vault — macOS Keychain, Windows DPAPI, or Linux libsecret — via Electron's
`safeStorage` API. The key is tied to your OS login, so stealing the database file without
also compromising your account gains nothing.

**Vault password (optional):** You can add a password to any vault in Settings → Vault. The
database key is then wrapped with Argon2id (64 MiB, 3 iterations, 4 lanes) and
AES-256-GCM, and stored alongside a 12-word BIP-39 recovery phrase in the vault's
`.corebooks` metadata file. The recovery phrase lets you reset a forgotten password without
losing your data. Write it on paper and keep it separate from your computer.

**Encrypted backups:** The Settings → Database page has an **Encrypted Export** option.
It encrypts your full data backup with AES-256-GCM using a passphrase you choose.
Key derivation uses PBKDF2-SHA256 at 600 000 iterations (OWASP 2023 guidance).
The output is a self-describing `.enc.json` file — the algorithm, KDF parameters,
salt, and IV are all stored alongside the ciphertext so any compliant tool can decrypt it.
There is no recovery if you lose the passphrase.

### Multi-user mode (PostgreSQL)

When you connect corebooks to a PostgreSQL server, your data travels over the network.

**SSL is required.** Add `?sslmode=require` (or `sslmode=verify-full` for certificate
validation) to your `DATABASE_URL`:

```
DATABASE_URL="postgresql://user:password@your-server:5432/corebooks?sslmode=require"
```

corebooks will warn you in the terminal and in the Settings UI if SSL is not detected.
Without SSL, credentials and financial data travel in plaintext and can be intercepted
by anyone on the same network.

**OS-level encryption:** Encrypt the disk on your PostgreSQL server (LUKS on Linux,
FileVault on macOS, BitLocker on Windows) to protect data at rest. This is standard
practice for any server holding sensitive data.

### What corebooks does not do

- It does not phone home. There are no analytics, telemetry, or error reporting calls.
- It does not store anything in the cloud. All data is yours and lives where you put it.
- It does not require an account, email, or any form of registration.

---

## Potential Features

These are areas where community contributions would be most valuable. None are scoped or scheduled — they're open invitations. If you want to work on one, open an issue first so we can align on design before you build.

| Feature | Description |
|---|---|
| **Accounts Receivable / Payable** | Customer and vendor entities, invoice tracking, payment matching, aging reports (30/60/90 day buckets). Payments auto-generate journal entries through the existing entry engine. |
| **Inventory Management** | Item catalog, quantities on hand, receive-goods and sell-goods flows, COGS accounting. Gated to product businesses via the feature flag system. |
| **Import from other accounting software** | Parse and import data from QuickBooks, Wave, FreshBooks, or CSV exports. Map external account structures to corebooks chart of accounts. |
| **PostgreSQL migration wizard** | Guided in-app flow to switch from SQLite to a shared PostgreSQL server: validate connection, migrate schema, copy data, confirm, restart. Plain-language UI — no technical jargon. |
| **Bank feed OFX/QFX parsing** | The bank feed page and import modal exist; CSV import works today. OFX/QFX format parsing is the next step to support direct bank statement downloads. |
| **AI-assisted categorisation** | Ollama AI infrastructure is in place (toolbar button, side panel, Settings → AI tab). Next: use the connected model to suggest account mappings during import. No API keys required — local inference only. |
| **Plugin API** | Webhook and plugin interface so third-party tools (Stripe, Shopify, payroll providers) can push source documents and drafts into corebooks. |
| **Multi-currency** | Record transactions in foreign currencies with exchange rate tracking and unrealised gain/loss accounts. |

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for how to get involved.

## License

[AGPL-3.0](./LICENSE) — Free to use, modify, and distribute. Modifications must remain open source.
