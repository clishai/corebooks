# corebooks Security

corebooks is open-source. Every line of security-relevant code is publicly auditable.

## Vault encryption

Each vault is a plain folder on disk. Sensitive data lives in `corebooks.db` (SQLite) inside that folder.

**Key architecture**

A 32-byte vault key K is generated once when you set a password. K is never stored in the clear — it is wrapped into two slots inside the `.corebooks` metadata file:

- **Password slot** — K encrypted with a key derived from your password via Argon2id.
- **Recovery slot** — K encrypted with a key derived from your 12-word BIP-39 recovery phrase.

Either slot alone recovers K. Both slots use independent random salts and IVs.

**Key derivation (Argon2id)**

Parameters: `m = 65536` (64 MiB), `t = 3` (3 iterations), `p = 4` (4 lanes).
These match the OWASP 2024 recommended minimum for Argon2id in interactive-login scenarios.

**Wrapping cipher**

AES-256-GCM. The 16-byte authentication tag is appended to the ciphertext. Any tampering with the ciphertext or the tag causes decryption to fail before any data is returned.

**What the password protects today**

The vault password protects the key slots stored in `.corebooks` and gates the encrypted export feature. Full SQLite database encryption (SQLCipher) is planned for a future release and is blocked on a custom Prisma adapter.

**Recovery phrase**

12 BIP-39 words (128 bits of entropy). Generated using a cryptographically secure random number generator. The phrase is shown once and never stored by the app. Write it on paper and keep it physically separate from your computer.

## Export encryption

Exported files are encrypted with AES-256-GCM using a per-export key derived via Argon2id (same parameters as vault key derivation). The output envelope records the algorithm and KDF parameters in plaintext so decryption tools can verify them.

## Key material handling

- Vault key K never leaves the Electron main process.
- Derived keys are ephemeral — created, used for one operation, then garbage-collected.
- No key material appears in log output or error messages.
- Argon2id parameters are centralised in a single constant (`ARGON2_PARAMS`) and cannot drift between operations.

## AI boundary

The optional Ollama AI integration is read-only. AI features may suggest and draft journal entries but cannot post to the ledger, receive a posting authority, or access vault key material. See `docs/AI_BOUNDARIES.md`.

## Reporting vulnerabilities

Open a GitHub issue marked **[security]** or email the maintainers directly. We aim to respond within 72 hours.
