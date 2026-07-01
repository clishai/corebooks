# Feature ideas and module boundaries

This is a brainstorming note, not a roadmap commitment. Nothing here is scheduled or scoped.

## Product principle

corebooks should keep the core ledger small, reliable, and dependency-free. New business workflows should adapt to the ledger by creating reviewable drafts or explicit user-approved posts — never by changing accounting rules in `src/core`.

## Strong candidates for first-party modules

### OFX/QFX bank statement parsing

- CSV import works today; OFX/QFX is the natural next step for direct bank statement downloads.
- Imported transactions must stay as drafts until the user reviews and posts them.

### Inventory

- Track items, SKU, quantity on hand, average cost, and COGS suggestions.
- First version should avoid FIFO/LIFO complexity and multi-location inventory.
- UI sidebar should stay feature-flagged until the workflow is mature.
- A good first-party candidate because inventory creates accounting entries and needs careful guardrails.

### Accounts Receivable / Payable

- Customer and vendor entities, invoice tracking, payment matching, aging reports (30/60/90 days).
- Payments auto-generate draft journal entries through the existing entry engine.
- Feature-flagged behind `ar_ap` until stable.

### AI-assisted categorisation (local only)

- Optional, local inference only — no API keys, no cloud.
- AI may suggest account mappings during import; output is always draft-only.
- AI must never post to the ledger, receive a posting authority, or access vault key material.
- Only makes sense to build once a local model integration is designed end-to-end.

### Payroll

- Gross pay, tax withholding, employer taxes, benefits, reimbursements, payroll liabilities.
- High compliance burden and jurisdiction-specific rules make this a better plugin candidate first.
- A corebooks-owned plugin could prove the plugin API without making payroll part of the core app.

## Better plugin-catalog candidates

Plugins are strongest when the workflow integrates with an external service or varies heavily by country/industry:

- payroll providers
- ecommerce platforms (Shopify, Square, Stripe)
- tax filing exports
- document OCR / receipt matching
- industry-specific invoice formats
- country-specific compliance modules

The plugin API should produce draft entries, import files, or validated source documents. Plugins should not receive a posting authority by default.

## Future catalog structure

Potential catalog metadata per plugin:

- name and publisher
- permissions: read accounts, create drafts, read vault imports, network access
- data destination disclosure
- supported countries/regions
- source code URL and license
- last tested corebooks version

## Smaller first-party ideas

- Rules engine for recurring categorisation (auto-suggest accounts on repeat payees)
- Report annotations and saved report packs
- Receipt matching from the vault `receipts/` folder
- Month-end task list tied to the close-period workflow
- Audit log visible to users (actor, channel, reversal links, import source)
- PostgreSQL migration wizard — guided in-app flow from SQLite to a shared server
