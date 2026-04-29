# corebooks

> Open-source, self-hosted accounting and bookkeeping software. Built from first principles.

**corebooks** is a privacy-first alternative to cloud accounting platforms. Your financial data lives on your machine — never in someone else's cloud.

This is a project by a college accounting major. The goal is to build the ultimate community-led accounting tool — one that any business owner can download, run, and own completely. Advances in AI and open-source tooling have made it possible for non-technical people to build the software they've always wanted, rather than being stuck with expensive, closed-source SaaS.

---

## Where We're Headed

The long-term goal is a **downloadable desktop app** — one file, double-click to open, no terminal required. Your books live on your computer. If you later need multiple employees to access the same data, you can connect to a shared server, but that is always optional.

The current setup (running commands in a terminal) is for contributors and developers. Regular users won't need to do this once the desktop app ships.

---

## Status

🚧 **Active Development** — Phase 4 (UI)

The accounting engine, database, REST API, and browser-based UI are all functional. The UI is dark-themed, fully navigable, and includes:
- Chart of accounts management
- Journal entry creation (with draft saving)
- Trial Balance, Balance Sheet, and Income Statement reports

A downloadable desktop app (.exe / .app) is planned for Phase 5.

---

## Getting Started (Developer Setup)

CoreBooks runs on your own computer. No account, subscription, or internet connection required.

### What you need

- **Node.js** version 20 or newer — download it at [nodejs.org](https://nodejs.org) (choose the "LTS" version)

That is it. No separate database software needed — corebooks uses SQLite, a lightweight database stored in a single file on your computer.

### Installation

Open a terminal and run these commands one at a time:

```bash
# 1. Download corebooks
git clone https://github.com/clishai/corebooks.git
cd corebooks

# 2. Install dependencies
npm install

# 3. Set up the database
npx prisma migrate deploy

# 4. Start the API server (keep this running)
npm run dev:api

# 5. In a second terminal tab, start the UI
npm run dev:ui
```

Open `http://localhost:5173` in your browser.

### Updating

```bash
git pull
npm install
npx prisma migrate deploy
```

---

## For Businesses / Multi-user Setup

By default, corebooks uses **SQLite** — a zero-configuration database stored in a single file on your computer. This is ideal for individual users or small teams on one machine.

If your business needs **multiple employees to access corebooks simultaneously** from different computers, you can connect to a **PostgreSQL** database on a shared server. PostgreSQL is free, open-source software designed for exactly this.

Think of it this way: SQLite is a notebook you keep at your desk. PostgreSQL is a shared filing cabinet your whole team can access at the same time. The switch only makes sense if you have a server that is always on and reachable by your staff.

A guided setup wizard is available in **Settings → Database** (coming in Phase 4).

---

## Vision

corebooks is designed like an onion. Each layer wraps the one before it without compromising the core.

| Layer | What It Does |
|---|---|
| **Core (Layer 1)** | Pure double-entry accounting engine. Chart of accounts, journal entries, general ledger, trial balance, financial statements. Zero external dependencies. |
| **Database & API (Layer 2)** | Persistence with SQLite (default) or PostgreSQL (business). REST API. |
| **UI (Layer 3)** | React + Tailwind browser-based interface. Dark mode. |
| **Desktop App (Layer 4 — Phase 5)** | Electron wrapper — bundle the whole app into a downloadable .exe / .app. |
| **Integrations (Future)** | Plugin API, webhooks, bank feeds, Stripe, AI assistant. |

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
- **Desktop (Phase 5):** Electron

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for how to get involved.

## License

[AGPL-3.0](./LICENSE) — Free to use, modify, and distribute. Modifications must remain open source.
