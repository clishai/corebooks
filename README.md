# CoreBooks

> Open-source, self-hosted accounting and bookkeeping software. Built from first principles.

CoreBooks is a privacy-first alternative to cloud accounting platforms. Your financial data lives on your machine or server — never in someone else's cloud.

## Status

🚧 **Early Development** — Phase 1 (Project Infrastructure)

CoreBooks is in early development. The foundation is being laid before the project opens to the public.

## Vision

CoreBooks is designed like an onion. Each layer wraps the one before it without compromising the core.

| Layer | What It Does |
|---|---|
| **Core (Layer 1)** | Pure double-entry accounting engine. Chart of accounts, journal entries, general ledger, trial balance, financial statements. Zero external dependencies. |
| **Structure & Reporting (Layer 2)** | Subsidiary ledgers, database persistence, multi-currency support, advanced reporting, web UI. |
| **Integration Infrastructure (Layer 3)** | Plugin API, webhooks, external integrations (Stripe, bank feeds). The core never changes — integrations adapt to it. |
| **Ecosystem & AI (Layer 4)** | Community plugin library. Model-agnostic AI assistant interface — bring your own model (Claude, GPT, Llama, Mistral, or any compatible API). |

## Who This Is For

- Small business owners who want full control of their books
- Freelancers and sole proprietors
- Accounting students learning double-entry bookkeeping
- Developers who want a hackable, extensible accounting engine
- Privacy-conscious users who won't hand their financial data to SaaS platforms

## Tech Stack

- **Language:** TypeScript (full-stack)
- **Database:** PostgreSQL
- **ORM:** Prisma
- **Frontend:** React + Tailwind CSS
- **Runtime:** Node.js

## Getting Started

> Setup instructions coming in Phase 2. The project is not yet runnable.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for how to get involved.

## License

[AGPL-3.0](./LICENSE) — Free to use, modify, and distribute. Modifications must remain open source.