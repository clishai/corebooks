# corebooks Security

corebooks is open-source. Every line of security-relevant code is publicly auditable.

## Vault encryption

Each vault is a plain folder on disk. Sensitive data lives in `corebooks.db` (SQLite) inside that folder.

**Key architecture**

A 32-byte vault key K is generated once when the vault is created. K is stored on your device inside the app's `userData` directory and never travels over the network. When a vault password is set, K is additionally wrapped into two slots inside the `.corebooks` metadata file:

- **Password slot** — K encrypted with a key derived from your password via Argon2id.
- **Recovery slot** — K encrypted with a key derived from your 12-word BIP-39 recovery phrase.

Either slot alone recovers K. Both slots use independent random salts and IVs. The raw key K never appears in the `.corebooks` file — only ciphertext wrapped around it.

**Key derivation (Argon2id)**

Parameters: `m = 65536` (64 MiB), `t = 3` (3 iterations), `p = 4` (4 lanes).
These match the OWASP 2024 recommended minimum for Argon2id in interactive-login scenarios.

**Wrapping cipher**

AES-256-GCM. The 16-byte authentication tag is appended to the ciphertext. Any tampering with the ciphertext or the tag causes decryption to fail before any data is returned.

**What the password protects**

The vault password protects:
- The key slots stored in `.corebooks` (password slot and recovery slot)
- The `corebooks.db` SQLite database, encrypted with SQLCipher using vault key K

**Database encryption (SQLCipher)**

`corebooks.db` is encrypted at rest using SQLCipher with AES-256 in CBC mode. The SQLCipher key is vault key K expressed as a 64-character hex string, applied via `PRAGMA key = "x'<hex>'"` (raw key mode — K already has full 256-bit entropy, no SQLCipher internal KDF needed).

On first launch after upgrading from a plaintext database, migration to SQLCipher happens automatically via `PRAGMA rekey`. No user action required.

**Recovery phrase**

12 BIP-39 words (128 bits of entropy). Generated using a cryptographically secure random number generator. The phrase is shown once and never stored by the app. Write it on paper and keep it physically separate from your computer.

> The recovery phrase format is inspired by [BIP-39](https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki), the Bitcoin Improvement Proposal that standardised mnemonic seed phrases. We liked the idea and borrowed it for accounting.

## Export encryption

Exported files are encrypted with AES-256-GCM using a per-export key derived via PBKDF2-SHA256 (600,000 iterations, OWASP 2023 guidance). The output envelope records the algorithm and KDF parameters in plaintext so any compliant tool can verify and decrypt them.

## Key material handling

- Vault key K never leaves the Electron main process.
- Derived keys are ephemeral — created, used for one operation, then zeroed and garbage-collected.
- No key material appears in log output or error messages.
- Argon2id parameters are centralised in a single constant (`ARGON2_PARAMS`) so they cannot drift between operations.

## Network exposure

The Fastify API server binds to `127.0.0.1` only (loopback). It is not reachable from the network in SQLite mode. In PostgreSQL mode, SSL is required — the app warns in the terminal and Settings UI if SSL is not detected.

## Posting authority

Every official ledger write requires an explicit posting authority. Valid authorities are `human`, `import`, `recurring`, `closing`, and `reversal`. No external integration or future AI feature may receive a posting authority without a deliberate design decision and code change.

## Reporting vulnerabilities

Open a GitHub issue marked **[security]** or email the maintainers directly. We aim to respond within 72 hours.
