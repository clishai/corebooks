# CoreBooks — Claude Code Context

## What This Project Is

CoreBooks is an open-source, self-hosted accounting and bookkeeping application built in TypeScript. It follows Onion Architecture — the innermost layer is a pure accounting engine, and each outer layer adds functionality without touching the core.

## Current Phase

Phase 1 — Project Infrastructure

The repository structure and foundational documents are being established. No application code exists yet. Phase 2 will begin building the core accounting engine.

## Architecture Overview

Layer 1 (Core):        Pure accounting engine — no external dependencies
Layer 2 (Structure):   Database, subsidiary ledgers, reporting, UI
Layer 3 (Integration): Plugin API, webhooks, external integrations
Layer 4 (Ecosystem):   Community plugins, AI assistant interface

## Key Principles

1. The core is sacred. src/core/ has zero external dependencies. Do not add imports to external libraries in this layer — ever.
2. Debits must equal credits. Every journal entry must balance. Validation is non-negotiable.
3. The accounting equation holds. Assets = Liabilities + Equity at all times.
4. Outer layers wrap inner layers. Never let an inner layer import from an outer layer.

## Tech Stack

- Language: TypeScript (strict mode)
- Runtime: Node.js
- Database: PostgreSQL (Phase 2+)
- ORM: Prisma (Phase 2+)
- Frontend: React + Tailwind CSS (Phase 3+)
- Testing: Vitest

## Developer Context

Brady (the primary developer) is an accounting professional learning to code. When suggesting code or making changes:

- Explain what the code does, not just what to type
- Use accounting analogies when explaining technical concepts
- Prefer clarity over cleverness
- Never silently fix something — explain what was wrong and why

## Planned Folder Structure

src/
  core/
    types/       - TypeScript interfaces (Account, JournalEntry, etc.)
    engine/      - Pure business logic (post, validate, report)
    validation/  - Accounting rules and constraints
  db/            - Database layer (Phase 2+)
  api/           - REST API (Phase 3+)
  ui/            - React frontend (Phase 3+)
  plugins/       - Plugin system (Phase 4+)
tests/
  core/          - Unit tests for the core engine

## Commit Conventions

Use Conventional Commits format:
- feat:     new feature
- fix:      bug fix
- docs:     documentation
- test:     tests
- chore:    maintenance

## What NOT to Do

- Do not add external dependencies to src/core/
- Do not modify the core to accommodate integrations — integrations adapt to the core
- Do not commit .env files, node_modules/, or build artifacts
- Do not skip tests for core accounting logic