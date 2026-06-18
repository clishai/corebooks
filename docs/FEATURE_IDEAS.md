# Feature ideas and module boundaries

This is a brainstorming note, not a roadmap commitment.

## Product principle

corebooks should keep the core ledger small, reliable, and dependency-free. New business workflows should adapt to the ledger by creating reviewable drafts or explicit user-approved posts, never by changing accounting rules in `src/core`.

## Strong candidates for first-party modules

### Bank feed import

- OFX/QFX/CSV import into a review queue.
- AI can suggest accounts and memos, but imported transactions stay drafts until reviewed.
- Best as a first-party workflow because it touches vault files, imports, and accounting UX.

### Inventory

- Track items, SKU, quantity on hand, average cost, and COGS suggestions.
- First version should avoid FIFO/LIFO complexity and multi-location inventory.
- UI/sidebar should stay feature-flagged until the workflow is mature.
- Could start first-party because inventory creates accounting entries and needs careful guardrails.

### Payroll

- Gross pay, tax withholding, employer taxes, benefits, reimbursements, and payroll liabilities.
- High compliance burden and jurisdiction-specific rules make this better as a plugin/catalog candidate first.
- A corebooks-owned plugin could prove the plugin API without making payroll part of the core app.

## Better plugin-catalog candidates

Plugins are strongest when the workflow integrates with an external service or varies heavily by country/industry:

- payroll providers;
- ecommerce platforms;
- Stripe/Square/PayPal imports;
- Shopify sales summaries;
- industry-specific invoice formats;
- tax filing exports;
- document OCR providers.

The plugin API should produce draft entries, import files, or validated source documents. It should not receive a posting authority by default.

## Future catalog structure

Potential catalog metadata:

- plugin name and publisher;
- permissions: read accounts, create drafts, read vault imports, network access;
- data destination disclosure;
- supported countries/regions;
- source code URL and license;
- last tested corebooks version.

## Smaller first-party ideas

- Rules engine for recurring categorisation suggestions.
- Account reconciliation checklist.
- Report annotations and saved report packs.
- Receipt matching from the vault `receipts/` folder.
- Client/company switcher metadata stored per vault.
- Month-end task list tied to close-period workflow.
- Audit log for posting channel, reversal links, and imports.
