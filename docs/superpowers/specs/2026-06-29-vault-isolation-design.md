# Vault Isolation Overhaul — Design

**Date:** 2026-06-29
**Status:** Approved (pending user sign-off on this written spec)
**Owners:** Brady Davidson + Claude

---

## 0. One-paragraph summary

Every CoreBooks vault becomes a fully self-contained, identity-bound, password-locked unit. The launch picker behaves like a train station: it knows the names and platforms of trains it has seen (path + display name + last-opened) but it knows nothing about the passengers, cargo, or interiors. App-global storage shrinks to the picker registry plus user-personal preferences explicitly unrelated to any business's books (keyboard shortcuts). All vault-scoped data — company name, fiscal year, currency, payment methods, feature flags, UI workspace state, audit log, encryption material — moves inside `<vault>/.corebooks/`. Every vault has a unique UUID, a mandatory password, an independent per-vault encryption key, an HMAC-protected key-wrapping file, and an append-only hash-chained audit log. Closing a vault produces a clean teardown — key buffer zeroed, Prisma disconnected, watcher closed, process lock released — and switching vaults happens in-process without an Electron relaunch.

---

## 1. Train-station mental model

The launch picker is a station board. It lists trains that have stopped here:

- **What the station knows:** the platform number (filesystem path), the train's name plaque (display name), and when it last departed (`lastOpened`).
- **What the station does NOT know:** who is on the train, what they're carrying, where they came from, what currency they use, or what their books look like.

The user (an employee at the station) decides which train to board. Boarding means producing the train's password (and, optionally, presenting a biometric token the station can verify on the train's behalf via the OS keychain). Once aboard, the train operates entirely from its own resources. When the user disembarks, the station forgets everything about the trip except that the train was here.

**Implications encoded in the design:**

1. `userData/picker.json` carries only `{ id, path, displayName, lastOpened }` per entry. Nothing else.
2. The picker entry's `displayName` is a *hint* — it is overwritten on next open from the canonical `vault.json` inside the vault. A user who renames a folder, or an attacker who swaps a vault folder, cannot mislead the picker beyond cosmetic appearance for one cycle.
3. Two vaults open on the same machine in the same day must behave as if they had never met. No cache, no localStorage entry, no settings file in `userData/` may carry data from vault A into vault B.

This model overrides any other ambiguity in the spec. When in doubt: *if the station would have to peek inside the train to know this, it doesn't belong in app-global storage.*

---

## 2. Target on-disk structure

```
<vault>/
  corebooks.db                       ← SQLCipher database
  .corebooks/                        ← NOW A DIRECTORY (was a single JSON file)
    vault.json                       ← identity: { schemaVersion, id (UUID v4), displayName, created }
    lock.json                        ← key wrapping: { schemaVersion, argon2, slots: {password, recovery}, hmac }
    settings.json                    ← per-vault settings: { schemaVersion, companyName, fiscalYearStart, currency, paymentMethods, featureFlags, ... }
    workspace.json                   ← UI state local to this vault: { lastTab, sidebarCollapsed, recentEntries, ... }
    audit.jsonl                      ← append-only hash-chained log (newline-delimited JSON)
    process.lock                     ← { pid, openedAt } — single-process exclusion
  imports/                           ← drop zone (unchanged)
  statements/                        ← archived statements (unchanged)
  receipts/                          ← receipts (unchanged)
  exports/                           ← app-generated exports (unchanged)
```

Outside any vault:

```
userData/
  picker.json                        ← { vaults: [{ id, path, displayName, lastOpened }] }  — station board only
  shortcuts.json                     ← user-personal keyboard shortcuts (NOT vault-scoped)
  .db.key                            ← REMOVED. The global K_os is gone; each vault has its own key.
```

**What dies:**
- `userData/vaults.json` → replaced by `picker.json` (new schema, only the four fields above).
- `userData/.db.key` → removed. There is no longer a single global encryption key.
- `<vault>/.corebooks` as a single file → upgraded to a directory.
- `cb_company_name`, `cb_flags`, `cb_payment_methods` in localStorage → migrated into `<vault>/.corebooks/settings.json`.

---

## 3. Per-vault key isolation

**Current (Plan F) weakness:** `K_os = K_vault` — a single key in `userData/.db.key` encrypts every vault on the machine. Compromise of `.db.key` compromises every vault. Copying a vault folder to another machine is useless without also copying `.db.key`, but a backup of `userData` exposes every vault simultaneously.

**Target:**
- Every vault has an independent 32-byte key K.
- K is generated by CSPRNG (`crypto.randomBytes(32)`) at vault creation.
- K never appears in any app-global location.
- K is wrapped in `lock.json` under two slots:
  - **Password slot:** Argon2id(password, salt₁, m=65536, t=3, p=4) → KEK₁ → AES-256-GCM(K) → `{salt, iv, ct}`.
  - **Recovery slot:** Argon2id(BIP-39_seed, salt₂, m=65536, t=3, p=4) → KEK₂ → AES-256-GCM(K) → `{salt, iv, ct}`.
- Both slots wrap the *same* K so a password change does not re-encrypt the database.
- An optional third slot, **biometric**, stores K in the OS keychain under a per-vault label (`corebooks.vault.<uuid>`) and is gated by the OS biometric prompt (Touch ID / Windows Hello / libsecret-on-Linux equivalent). This slot is opt-in per vault.

**HMAC integrity of `lock.json`:**

```
lock.json.hmac = HMAC-SHA256(
  key   = SHA-256("corebooks.lock.hmac" || vault.id),
  input = canonical_json({schemaVersion, argon2, slots})
)
```

The HMAC is keyed to the vault's UUID. Swapping `lock.json` between vaults, or hand-editing it, breaks the HMAC and `openVault` rejects with `VaultLockTampered` *before* running Argon2id (Section 9, T3).

**Migration of existing vaults:** Each vault's database is re-keyed once via `PRAGMA rekey` from the old K_os to a freshly generated per-vault K. The old `.db.key` file is shredded only after every vault on the machine has successfully migrated.

---

## 4. Per-vault settings

`<vault>/.corebooks/settings.json` is a flat interface keyed by `schemaVersion`:

```ts
interface VaultSettings {
  schemaVersion: 1;
  companyName: string;
  fiscalYearStart: { month: number; day: number };
  currency: string; // ISO 4217
  paymentMethods: string[];
  featureFlags: { ar_ap: boolean; inventory: boolean };
  // ...extends with new top-level keys as the app grows
}
```

**Defaults:** A single hardcoded `DEFAULT_VAULT_SETTINGS` constant in `src/electron/vault/defaults.ts`. New vaults get this constant copied in at creation. The onboarding wizard mutates the file in place once the user answers its questions.

**Missing-settings rule:** If `.corebooks/settings.json` is absent or invalid on open, `VaultLifecycle.open()` resolves with `{ status: 'needs-settings-confirmation', defaults: VaultSettings }`. The UI must show a modal: *"This vault has no settings file. Restore defaults and continue, or cancel?"* No silent overwrite. (Section 9, T20.)

**Schema migrations:** A registry `settingsMigrators: Record<number, (v: any) => VaultSettings>` co-located in `src/electron/vault/settings.ts` (same module that owns `settings.json` I/O — one place to look when bumping the schema). Bumping `schemaVersion` without registering a migrator causes open to fail loudly. (Section 9, T22.)

**No future-plugin scaffolding.** The interface stays flat. Plugin extension points are a separate future design conversation — explicitly out of scope for this overhaul.

---

## 5. Append-only hash-chained audit log

`<vault>/.corebooks/audit.jsonl` is the vault's git-like history. One JSON object per line:

```jsonc
{
  "seq": 0,
  "at": "2026-06-29T18:00:00.000Z",
  "actor": "system",
  "event": "vault.created",
  "data": { "id": "<uuid>", "displayName": "Acme Books" },
  "prevHash": "0000000000000000000000000000000000000000000000000000000000000000",
  "hash": "<sha256 of canonical_json({seq, at, actor, event, data, prevHash})>"
}
{
  "seq": 1,
  "at": "...",
  "actor": "human",
  "event": "vault.opened",
  "data": {},
  "prevHash": "<hash of seq 0>",
  "hash": "<sha256 ...>"
}
```

**Properties:**
- **Actor values are a closed set.** `actor: 'system' | 'human' | 'migration'`. `system` is the app itself (open, close, lock-reclaim). `human` is a deliberate user action (password change, biometric toggle, settings restore). `migration` is the one-time legacy upgrade path. No other actors are valid.
- **Append-only.** The lifecycle service exposes `appendAuditEvent(event, data)`. No "edit" or "delete" API exists.
- **Hash-chained.** Each line's hash includes the previous line's hash. Tampering with any line invalidates every subsequent hash. `verifyAuditChain(vaultPath)` returns `{ ok: true } | { ok: false, brokenAt: number }`.
- **Canonical JSON.** Sorted keys, no whitespace, UTF-8 — required for hash stability across reads/writes.
- **Genesis entry.** `seq: 0` always exists, always has `prevHash: <64 zeros>`, always records `vault.created`.
- **Informational, not authoritative.** A tampered chain does not block vault open; it surfaces a warning in the UI ("Audit log integrity broken at line N — vault content is unaffected but tamper is suspected"). The chain is *evidence*, not *gate*.

**Events recorded:**

| Event | When |
|---|---|
| `vault.created` | At creation |
| `vault.opened` | Successful open |
| `vault.closed` | Clean close |
| `vault.lock-reclaimed` | Stale `process.lock` cleared |
| `vault.migrated-from-legacy` | Legacy → new format migration |
| `password.changed` | Password rotation via current password |
| `password.rotated-via-recovery` | Password reset using BIP-39 phrase |
| `biometric.enabled` / `biometric.disabled` | User toggles biometric slot |
| `settings.migrated` | Settings schema bump applied |
| `settings.restored-defaults` | User confirmed default settings on missing file |

Posting events (journal entries, drafts, etc.) live in the database, not in the audit log. The audit log is for *vault-lifecycle* events only.

---

## 6. `VaultLifecycle` — the single seam

A new module at `src/electron/vault/lifecycle.ts` is the *only* surface that orchestrates vault state. Nothing else in the app may open a database, hold a key, or directly write `.corebooks/` files.

```ts
class VaultLifecycle {
  private _current: ActiveVault | null = null;
  get current(): Readonly<ActiveVault> | null { return this._current; }

  // creation / opening
  create(args: { directory: string; displayName: string; password: string }): Promise<ActiveVault>;
  open(args: { path: string; password?: string; biometric?: boolean }): Promise<OpenResult>;
  unlockWithRecovery(args: { path: string; phrase: string; newPassword: string }): Promise<ActiveVault>;

  // teardown
  close(): Promise<void>;
  switch(args: { path: string; password?: string }): Promise<OpenResult>;

  // settings / workspace
  confirmDefaultSettings(): Promise<void>;
  updateSettings(patch: Partial<VaultSettings>): Promise<void>;
  updateWorkspace(patch: Partial<VaultWorkspace>): Promise<void>;

  // audit
  appendAuditEvent(event: string, data: unknown): Promise<void>;
  verifyAuditChain(): Promise<{ ok: true } | { ok: false; brokenAt: number }>;

  // biometric
  enableBiometric(): Promise<void>;
  disableBiometric(): Promise<void>;
}

type OpenResult =
  | { status: 'opened'; vault: ActiveVault }
  | { status: 'needs-password' }
  | { status: 'needs-settings-confirmation'; defaults: VaultSettings }
  | { status: 'busy'; lockedByPid: number }
  | { status: 'identity-mismatch' }
  | { status: 'lock-tampered' };
```

**State held in memory by an active vault:**
- `key: Buffer` — the 32-byte K. Zeroed on close.
- `prisma: PrismaClient` — single connection.
- `db: Database` — the underlying `better-sqlite3-multiple-ciphers` instance.
- `watcher: VaultWatcher` — chokidar across `imports/statements/receipts/exports`.
- `processLockPath: string` — path to `.corebooks/process.lock` for cleanup.

**Teardown sequence (called on close, switch, and app quit):**

1. Append `vault.closed` to audit log. (Audit is plaintext JSONL — no key needed — but appending first guarantees the event lands even if a later step crashes.)
2. Stop the API server (Fastify).
3. `await prisma.$disconnect()`.
4. `db.close()`.
5. `await watcher.close()`.
6. `key.fill(0)`. Drop the reference.
7. Remove `process.lock` if PID matches.
8. Set `current = null`.

**Switch-vault:** runs full teardown of A, then full open of B, all in one process. No Electron relaunch. (The Plan F requirement to relaunch came from the Prisma singleton — eliminated here because `PrismaClient` is owned by `VaultLifecycle.current`, not by a module-level singleton.)

---

## 7. Migration from legacy vaults

A "legacy vault" is a vault produced by Phase 10/11 or Plan F:
- Single-file `.corebooks` JSON (not a directory)
- Database encrypted with the global K_os from `userData/.db.key`
- No `vault.json`, no `lock.json`, no audit log

**Migration is performed on first open of a legacy vault under the new code.**

**Defensive backup pattern:**

```
1. Read legacy .corebooks JSON. Validate.
2. Rename .corebooks → .corebooks.legacy-backup        (the slot is now free for a directory)
3. Copy corebooks.db → corebooks.db.pre-migration      (file copy; original stays for rekey)
4. Generate fresh per-vault K via crypto.randomBytes(32).
5. Open corebooks.db with old K_os, PRAGMA rekey to new K. (In-place rekey on the original.)
6. mkdir .corebooks/                                   (slot freed in step 2)
7. Write vault.json, lock.json (password slot from user prompt, recovery slot from new BIP-39 phrase shown to user), settings.json (migrated from localStorage + legacy fields), workspace.json (defaults), audit.jsonl (genesis + vault.migrated-from-legacy).
8. Keep .corebooks.legacy-backup and corebooks.db.pre-migration until the user clicks "Migration complete — clean up backups" in Settings. No automatic deletion; the user owns the cleanup decision.
```

**Failure handling:** If any step 3–7 fails, restore from backups (rename `.corebooks.legacy-backup` → `.corebooks`, copy `corebooks.db.pre-migration` → `corebooks.db`) and abort. The vault remains openable in its legacy state with the legacy code. (Section 9, T7 covers each failure point.)

**The global `.db.key` is shredded only after every vault listed in `picker.json` has migrated.** A "Pending migrations: N vaults" indicator in Settings warns the user until the global key can be removed.

**One-time localStorage migration:** On first vault open under the new code, the UI reads `cb_company_name`, `cb_flags`, `cb_payment_methods` from `localStorage`, writes them into the current vault's `settings.json`, then removes them from `localStorage`. A confirmation toast explains: *"Moved per-vault preferences from app storage into this vault."* The keys are only migrated into the *first* vault opened post-upgrade (defensible heuristic; cross-vault preference inheritance was never intended).

---

## 8. Passwords, biometrics, and the OS keychain

**Mandatory passwords.** Every vault has a password. There is no "unencrypted vault" option. The vault-creation wizard:
1. Asks for a display name.
2. Asks for a password. Minimum length 12 characters (per NIST SP 800-63B guidance on memorized secrets), no composition rules, no maximum. Strength meter is advisory only.
3. Generates and *displays* a 12-word BIP-39 recovery phrase. User must check "I have written this down" before continuing.
4. Optionally asks "Enable biometric unlock on this device?" (default off).

**Why mandatory passwords:** The Plan F design allowed unencrypted vaults backed only by the OS keychain — meaning anyone with physical access to an unlocked Mac could open the vault. Mandatory passwords mean even a stolen laptop with an open session cannot reveal vault contents without the user's password or biometric. Biometric becomes a *convenience layer* on top, not a security substitute.

**The OS keychain is opt-in and per-vault.** When the user enables biometric for a vault:
- macOS: stores K under `corebooks.vault.<uuid>` with `kSecAttrAccessControl = .biometryCurrentSet` — keychain refuses to release the item without a live Touch ID.
- Windows: stores K via `safeStorage` with `UserConsentVerifier` requiring Windows Hello.
- Linux: stores K via `safeStorage`. If libsecret / GNOME Keyring / KWallet absent, the biometric toggle is grayed out with an explanatory tooltip. (Section 9, T16.)

The keychain item key is per-vault (`corebooks.vault.<uuid>`), so two vaults on the same machine have two independent keychain entries. Removing a vault from the picker (or disabling biometric for that vault) deletes its keychain entry.

**Re-prompting:** Every vault open requires either password entry *or* a fresh biometric prompt. Opening, closing, and re-opening the same vault in the same session requires the same. There is no "remember me for N minutes" mode — vault open is an explicit consent action.

**`COREBOOKS_DB_KEY` environment variable is eliminated.** K flows as a `Buffer` argument from `VaultLifecycle` directly into `openDatabase()` and `SqlCipherAdapterFactory`. No environment variable means no accidental leak via subprocess inheritance, no shell history, no `ps` exposure. (Section 9, T14 is a static guard against re-introduction.)

**"Close Vault" button.** Settings → General → "Close Vault" button. Calls `VaultLifecycle.close()`, then routes to the picker. Replaces the relaunch-based "Switch vault" of Plan F.

---

## 9. Testing strategy

Vitest cases in `tests/electron/vault/`. Most use a temp directory; a few stub Electron's `safeStorage` / biometric APIs through an injectable seam.

### 9.1 Required cases (load-bearing — never allowed to regress)

| # | Test | Asserts |
|---|---|---|
| T1 | creates valid isolated vault structure | `createVault(path, password)` produces `.corebooks/{vault.json, lock.json, settings.json, workspace.json, audit.jsonl, process.lock}` + empty `imports/ statements/ receipts/ exports/` + keyed `corebooks.db`. Every JSON file parses. `vault.json` has a v4 UUID. `audit.jsonl` has exactly one line (`vault.created`) with a valid genesis hash. No file outside the vault directory is created. No global state is written. |
| T2 | rejects open with wrong UUID | Create vault A. Hand-edit `.corebooks/vault.json` to a different UUID. `openVault(path, password)` rejects with `VaultIdentityMismatch` before any DB open. No key material reaches memory. |
| T3 | rejects open when `lock.json` HMAC is tampered | Flip one byte in the wrapped ciphertext, salt, or HMAC. `openVault` rejects with `VaultLockTampered` *before* running Argon2id (guarded by a fake-slow Argon2id stub that throws if called). |
| T4 | detects tampered audit line | Append 5 events, hand-edit line 3's payload. `verifyAuditChain` returns `{ ok: false, brokenAt: 3 }`. Appending after tampering still succeeds; `verifyAuditChain` continues to report `brokenAt: 3`. |
| T5 | zeroes in-memory state on close | After `closeVault()`: cached `Buffer` for K has been `.fill(0)`'d, `VaultLifecycle.current` is `null`, chokidar watcher is `.close()`d, Prisma client is `$disconnect()`'d, `process.lock` is removed. Re-opening works. |

### 9.2 Identity & migration cases

| # | Test | Asserts |
|---|---|---|
| T6 | migrates legacy single-file `.corebooks` vault | Fake legacy vault + global K_os. Run migration. Legacy file → `.corebooks.legacy-backup`, `corebooks.db.pre-migration` exists, new `.corebooks/` populated, `PRAGMA rekey` ran with per-vault key, queries return identical results, audit log records `vault.migrated-from-legacy` as first non-genesis event. |
| T7 | aborts migration on any failure and restores backups | Inject synthetic failure at three points (after backup pre-rekey, mid-rekey, post-rekey pre-metadata). Each leaves the vault openable by the legacy code path. |
| T8 | picker registry never carries vault contents | After creating 3 vaults, `userData/picker.json` entries contain only `{id, path, displayName, lastOpened}`. No field matches `password|key|salt|iv|hash|settings`. |
| T9 | picker hint mismatch does not auth | Edit `picker.json` to change a vault's `displayName`. Open the vault — canonical `vault.json` name wins, no warning leaks key material, picker entry corrected on next list. |

### 9.3 Crypto & key-handling cases

| # | Test | Asserts |
|---|---|---|
| T10 | each vault has an independent key | Create A (password `p1`) and B (password `p2`). Unwrap A with `p1` → K_A. Unwrap B with `p2` → K_B. `K_A !== K_B`. Open A's DB with K_B → SQLCipher rejects. |
| T11 | recovery phrase unlocks and rotates password | Capture BIP-39 phrase, close, open with phrase + new password. New password slot decrypts with new password; recovery slot decrypts with the same phrase. Audit log records `password.rotated-via-recovery`. |
| T12 | Argon2id parameters are pinned | `lock.json.argon2 = { m: 65536, t: 3, p: 4 }`. Changing these constants without a migration path is a breaking change. |
| T13 | wrong password does not leak timing | 10 wrong + 10 right opens (limited iteration count keeps CI under 15s at pinned Argon2id parameters). Mean rejection time within ±15% of mean accept time. The stricter assertion — that both paths execute the full Argon2id KDF unconditionally before any branch — is enforced by a code-path inspection test, not by timing statistics. Timing test runs only in the nightly suite. |
| T14 | K passed as Buffer, never via env var | Static grep guard: `COREBOOKS_DB_KEY` and `process.env.*KEY` return zero hits in non-test code. |

### 9.4 Biometric & lifecycle cases

| # | Test | Asserts |
|---|---|---|
| T15 | biometric opt-in stores K in keychain under per-vault label | Stubbed `safeStorage`: opt vault into biometric → keychain item key is `corebooks.vault.<uuid>`. Disable → keychain item removed. |
| T16 | biometric absent falls back to password | Stub `safeStorage.isEncryptionAvailable()` → false. Opt-in shows "not available" path, no crash. Vault remains password-only. |
| T17 | close vault releases process lock | Two `VaultLifecycle` instances in one Node process. A opens X → lock written. B tries X → `VaultBusy`. A closes → B succeeds. |
| T18 | stale process lock from dead PID is reclaimed | Write `process.lock` with PID = `99999999`. Open succeeds, lock overwritten, audit log records `vault.lock-reclaimed`. |
| T19 | switch-vault tears down and rebuilds cleanly | Open A, switch to B (no relaunch). A's key zeroed, Prisma disconnected, watcher closed, lock released. B fully live. No file handles to A remain. |

### 9.5 Settings & workspace cases

| # | Test | Asserts |
|---|---|---|
| T20 | missing `settings.json` triggers explicit prompt, never silent write | Delete `settings.json`. Open resolves with `{ status: 'needs-settings-confirmation', defaults }`. Without `confirmDefaultSettings()`, no `settings.json` is written. |
| T21 | `workspace.json` corruption is non-fatal | Replace with invalid JSON. Vault opens. File recreated from defaults with `warn` audit entry. Settings and audit log untouched. |
| T22 | settings schema version bump runs registered migrator | Bump schemaVersion → 2 with a registered 1→2 migrator. Open vault. Migrator runs, file updated, audit records `settings.migrated 1→2`. Missing migrator = loud failure. |

### 9.6 Integration smoke

| # | Test | Asserts |
|---|---|---|
| T23 | full lifecycle round-trip | Create vault → post a journal entry through `postingService` → close → reopen with password → verify entry exists → switch to a second vault → confirm first vault's data unreachable → close everything. Real (temp-dir) SQLCipher DB. |

### 9.7 Non-goals

- Cryptographic primitive correctness (Argon2id, AES-GCM, SHA-256) — covered by upstream library tests.
- Electron packaging — manual smoke before release.
- SQLCipher integration — covered by `tests/db/sqlcipherIntegration.test.ts` from Plan F.

### 9.8 CI gates

- All 23 cases must pass before merge.
- **T1, T2, T3** tagged `@vault-isolation-critical` — pre-push hook hard-blocks on any failure.
- **T14** runs as lint, not Vitest — fires even when test files aren't executed.

---

## 10. Out of scope (explicit)

- Plugin/extension settings sections (Section 4 stays flat).
- Cross-vault search or "show me all my businesses' Q3 revenue" features.
- Multi-process vault open (one process per vault, enforced by `process.lock`).
- Cloud sync, vault sharing, or any networked vault location. Vaults are local-filesystem-only.
- Changing core accounting engine, Prisma schema, or any non-vault code path.

---

## 11. Files affected

**New:**
- `src/electron/vault/lifecycle.ts` — the `VaultLifecycle` class
- `src/electron/vault/identity.ts` — UUID + `vault.json` I/O
- `src/electron/vault/lockFile.ts` — Argon2id wrapping, HMAC, slots
- `src/electron/vault/settings.ts` — `settings.json` I/O + migrator registry
- `src/electron/vault/workspace.ts` — `workspace.json` I/O
- `src/electron/vault/audit.ts` — hash-chained log writer + verifier
- `src/electron/vault/processLock.ts` — `process.lock` PID exclusion
- `src/electron/vault/biometric.ts` — OS keychain seam with platform branches
- `src/electron/vault/migration.ts` — legacy → new migrator with defensive backups
- `src/electron/vault/defaults.ts` — `DEFAULT_VAULT_SETTINGS`
- `tests/electron/vault/*.test.ts` — the 23 cases from Section 9

**Modified:**
- `src/electron/main.ts` — IPC handlers route through `VaultLifecycle`; eliminate `COREBOOKS_DB_KEY` env var; eliminate `getOrCreateEncryptionKey`; auto-open never bypasses password
- `src/electron/preload.ts` — IPC surface updated (close, switch, unlockWithRecovery, settings/workspace, audit query, biometric)
- `src/ui/electron.d.ts` — match preload changes
- `src/ui/pages/VaultPickerPage.tsx` — picker uses `picker.json`; train-station model in copy
- `src/ui/components/UnlockVaultModal.tsx` — used for every vault, not just encrypted ones
- `src/ui/pages/SettingsPage.tsx` — "Close Vault" button in General; biometric toggle in Vault tab
- `src/db/client.ts` — K accepted as `Buffer`, not from env var
- `src/db/openDatabase.ts` — same
- `CLAUDE.md` — already updated with Vault Isolation Principle
- `build/icon.png` — already replaced with new "~/" mark

**Deleted:**
- `src/electron/vaultManager.ts` — superseded by `VaultLifecycle`
- `src/electron/vaultTypes.ts` — types move into `src/electron/vault/types.ts`
- `userData/.db.key` — shredded after all-vaults migration

---

## 12. Sign-off

Brady approved Sections 1–9 in conversation. This document consolidates those approvals. Next step is the writing-plans skill to translate this spec into an ordered implementation plan.
