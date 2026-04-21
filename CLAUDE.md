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

## Current Phase

**Phase 3 — Persistence and API**

Phase 2 is complete. The core accounting engine is fully built and tested.

Phase 3 adds the database layer (Prisma + PostgreSQL) and a REST API. The
onion architecture rule applies strictly: the database and API layers adapt
to the core — the core is never modified to accommodate them.

### Phase 3 Scope

Phase 3 adds persistence and a REST API. Build in this order:

**Database layer (src/db/) — NEXT**
- Install Prisma and `@prisma/client` as dependencies (these are outer-layer
  packages; never import them in `src/core/`).
- Write a Prisma schema (`prisma/schema.prisma`) with models for:
  - `Account` — mirrors `src/core/types/account.ts`; store `normalBalance` as
    an enum, `contraTo` as a nullable enum, `isContra` as Boolean.
  - `JournalEntry` — mirrors `JournalEntry` interface; `status` as enum;
    `amount` fields are **integers (cents)**, never floats.
  - `JournalLine` — mirrors `JournalLine` interface; `amount` as Int (cents).
- Write a mapper layer (`src/db/mappers.ts`) that converts between Prisma
  model objects and core types. This is the one place where cent↔number
  conversion happens. The core never sees cents; the DB never sees floats.
- Do not put any accounting logic in `src/db/`. It maps and persists only.

**Repository functions (src/db/repositories/)**
- `accountRepository.ts` — CRUD for accounts (find, list, create, update).
- `entryRepository.ts` — persist draft entries; load posted entries into a
  `Ledger` instance on startup (replay pattern); append new posted entries.
- Repositories call core engine functions (`postEntry`, `validateEntry`, etc.)
  and persist the results. They do not re-implement accounting rules.

**REST API (src/api/)**
- Choose Express or Fastify (Fastify preferred for TypeScript ergonomics).
- Routes call repositories or engine functions directly. No accounting logic
  lives here — the API is a thin adapter over the core.
- Minimum routes for Phase 3:
  - `GET  /accounts` — list chart of accounts
  - `POST /accounts` — create account
  - `GET  /entries` — list posted entries
  - `POST /entries/draft` — save a draft entry
  - `POST /entries/post` — post a draft entry (runs full validation)
  - `POST /entries/:id/reverse` — reverse a posted entry
  - `GET  /reports/trial-balance` — current trial balance
  - `GET  /reports/balance-sheet?asOf=YYYY-MM-DD` — balance sheet
  - `GET  /reports/income-statement?from=...&to=...` — income statement

**Tests (tests/db/, tests/api/)**
- DB tests use a test PostgreSQL database (never the live DB).
- API tests use supertest or similar; they should hit real routes with a
  test DB, not mocked repositories.

**Phase 3 Constraints**
- The core (`src/core/`) must not change. If a DB or API requirement seems
  to need a core change, stop and solve it in the adapter layer.
- All amounts crossing the DB boundary must be converted: multiply by 100
  (number → cents) on write, divide by 100 (cents → number) on read.
  Conversion only in `src/db/mappers.ts`.
- No floating-point amounts in the Prisma schema or database.
- API responses use the core's TypeScript types (after mapper conversion),
  not raw Prisma model types.

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
      db/           ← Layer 2: Database layer (Prisma + PostgreSQL) — Phase 3
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

## What NOT to Do

- Do not install external packages into `src/core/`. It must remain dependency-free.
- Do not use `console.log` for error handling — use proper TypeScript error types.
- Do not skip tests. If a function exists in the core, a test must exist for it.
- Do not make silent changes. Always explain what changed and why.

## Stack

- Language: TypeScript (strict mode)
- Runtime: Node.js
- Database: PostgreSQL with Prisma ORM (Phase 3)
- Frontend: React with Tailwind CSS (Phase 3)
- Testing: Vitest (Phase 2)
- Package manager: npm

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
- A persistent save button is always visible in the left toolbar.
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