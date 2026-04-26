# CoreBooks

> Open-source, self-hosted accounting and bookkeeping software. Built from first principles.

CoreBooks is a privacy-first alternative to cloud accounting platforms. Your financial data lives on your machine or server — never in someone else's cloud.

This is a project by a college accounting major. Would love any support on making this the ultimate community-led accounting software. Advancements in artificial intelligence and coding languages have made it possible for non-technical business minds to "speak into existence" the software we have always wanted to use rather than being at the whim of closed-source, proprietary SaaS.

## Status

🚧 **Early Development** — Phase 3 (Database & API)

The accounting engine and REST API are functional. A user interface is coming in Phase 4.

---

## Getting Started

CoreBooks runs on your own computer. No account, subscription, or internet connection required.

### What you need before installing

- **Node.js** version 20 or newer — download it at [nodejs.org](https://nodejs.org) (choose the "LTS" version)

That's it. No separate database software required — CoreBooks uses SQLite, which is a lightweight database that lives in a single file on your computer.

### Installation

Open a terminal (Mac: search "Terminal" in Spotlight; Windows: search "Command Prompt" or "PowerShell") and run these commands one at a time:

```bash
# 1. Download CoreBooks
git clone https://github.com/clishai/corebooks.git
cd corebooks

# 2. Install dependencies
npm install

# 3. Set up the database (creates corebooks.db in this folder)
npx prisma migrate deploy

# 4. Build the app
npm run build

# 5. Start the server
npm start
```

The server will start at `http://localhost:3000`. A browser-based interface is coming in Phase 4 — for now the API is available directly.

### Updating to a newer version

```bash
git pull
npm install
npx prisma migrate deploy
npm run build
npm start
```

---

## For Businesses / Multi-user Setup

By default, CoreBooks uses **SQLite** — a zero-configuration database stored in a single file on your computer. This is ideal for individual users and small teams on one machine.

If your business needs **multiple employees to access CoreBooks simultaneously** from different computers, you'll want to connect CoreBooks to a **PostgreSQL** database hosted on your server. PostgreSQL is free, open-source database software designed for shared, multi-user environments.

### What "connecting to a wider database" means

Think of SQLite as a notebook you keep at your desk. PostgreSQL is more like a shared filing cabinet your whole team can access at the same time. The switch only makes sense if you have a server that's always on and reachable by your staff.

### Business setup overview

1. Install PostgreSQL on your server ([postgresql.org](https://postgresql.org))
2. Create a database and note the connection string (looks like `postgresql://user:password@your-server:5432/corebooks`)
3. In the CoreBooks settings, use the **Database** section to switch from SQLite to PostgreSQL

> **Note:** A guided step-by-step switcher is coming in the settings screen (Phase 4). Until then, see `prisma/schema.prisma` and `.env.example` for manual configuration.

---

## Vision

CoreBooks is designed like an onion. Each layer wraps the one before it without compromising the core.

| Layer | What It Does |
|---|---|
| **Core (Layer 1)** | Pure double-entry accounting engine. Chart of accounts, journal entries, general ledger, trial balance, financial statements. Zero external dependencies. |
| **Database & API (Layer 2)** | Persistence with SQLite (default) or PostgreSQL (business). REST API. |
| **Integration Infrastructure (Layer 3)** | Plugin API, webhooks, external integrations (Stripe, bank feeds). |
| **Ecosystem & AI (Layer 4)** | Community plugin library. AI assistant interface — bring your own model. |

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
- **Frontend:** React + Tailwind CSS (Phase 4)
- **Runtime:** Node.js

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for how to get involved.

## License

[AGPL-3.0](./LICENSE) — Free to use, modify, and distribute. Modifications must remain open source.
