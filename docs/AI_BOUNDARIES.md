# AI boundaries in corebooks

corebooks can use local models to observe, explain, classify, and suggest. AI must not post official journal entries.

## Current position

- Ollama is the default local model runtime because it is self-hosted, open source, and does not require cloud accounts.
- AI configuration is opt-in and localhost-only.
- The accounting core remains unaware of AI, users, screens, or model providers.
- Official ledger writes require a non-AI posting authority in the API/persistence layer.

## Allowed AI capabilities

AI may:

- suggest account categories for imported bank lines;
- explain why a transaction may belong to an account;
- generate draft journal-entry suggestions;
- summarize reports or highlight anomalies;
- prepare review queues that a human can accept, edit, or reject.

AI may not:

- call an entry posting endpoint;
- receive a posting authority;
- mark a draft as `Posted`;
- bypass period locks or validation;
- create reversals or closing entries;
- mutate the core ledger directly.

## Structure for future AI work

Future AI code should be organized around draft-only services:

```text
src/api/services/aiDraftService.ts      # future: prompt assembly + draft suggestion output
src/api/routes/ai.ts                    # future: suggest/categorize endpoints only
src/ui/lib/ai/                          # future: provider abstraction, local runtime config
```

AI routes should return suggested drafts or annotations, not posted entries. If a user accepts an AI suggestion, the normal draft save path should be used. Posting remains a separate human/system action behind the posting authority facade.

## Posting authority

Official posts now flow through named non-AI channels:

- `human`
- `import`
- `recurring`
- `closing`
- `reversal`

There is intentionally no `ai` posting channel. Static tests keep posting primitives limited to the posting facade and prevent AI/Ollama modules from importing posting authority.

## Provider strategy

Ollama should remain the default provider. Before adding actual inference, introduce a provider interface so the app can support future local runtimes without binding business logic to Ollama's HTTP shape:

```ts
interface LocalModelProvider {
  checkHealth(): Promise<{ ok: boolean; models: string[] }>
  suggestDrafts(input: CategorisationInput): Promise<DraftSuggestion[]>
}
```

Cloud providers should not be added as a default path. If remote endpoints are ever supported, they should be an explicit advanced mode with clear data-flow warnings.
