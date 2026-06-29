# Plan F — SQLCipher Full Database Encryption: Design Spec

## Goal

Encrypt every vault's `corebooks.db` at rest using SQLCipher, keyed by the vault key K established in Plan E. Password-protected vaults prompt for the password on launch; non-password vaults unlock transparently via the OS keychain.

## Architecture

### Key material

The SQLCipher raw key is `COREBOOKS_DB_KEY` — vault key K (32 bytes, expressed as a 64-char hex string) already managed by Plan E:

- **No vault password**: K is read from `userData/.db.key` (safeStorage-encrypted) on launch. No user interaction required.
- **Vault password set**: K is wrapped in slot A of `.corebooks`. User must enter password on vault selection → Argon2id derives slot key → AES-256-GCM unwrap → K recovered. BIP-39 recovery phrase (slot B) remains the fallback.

SQLCipher is configured with `PRAGMA key = "x'<64-char-hex>'"` (raw key mode — no internal KDF, K already has full 256-bit entropy).

### Open sequence (every vault launch)

```
Vault selected in vault picker
        │
        ▼
vault has password?
  ├── No  → COREBOOKS_DB_KEY already set from OS keychain
  └── Yes → show UnlockVaultModal over vault picker
               password → Argon2id → unwrap slot A → set COREBOOKS_DB_KEY
        │
        ▼
openDatabase(filePath, key)                    [src/db/openDatabase.ts]
  1. new Database(filePath)                    ← better-sqlite3-sqlcipher
  2. db.pragma(`key = "x'${key}'"`)           ← apply raw key
  3. probe: SELECT count(*) FROM sqlite_master ← verify key correct
  4. if plaintext DB detected → migrate in-place (sqlcipher_export)
  5. return keyed Database instance
        │
        ▼
ensureSchema(db)          ← receives keyed instance, not file path
        │
        ▼
new SqlCipherAdapter(db)  ← patched adapter, pre-opened instance
new PrismaClient({ adapter })
        │
        ▼
startServer(port)         ← unchanged
```

## Components

### `src/db/sqlcipherAdapter.ts` (new)

Verbatim copy of `@prisma/adapter-better-sqlite3` source, with one constructor patch:

```typescript
// Original:
constructor(config: { url: string }) {
  this.db = new Database(filePath)
}

// Patched:
constructor(config: { url: string }, db?: Database) {
  this.db = db ?? new Database(filePath)
}
```

File header documents the source version and exact lines changed so the patch can be mechanically re-applied on adapter upgrades. All other adapter code — transaction handling, query execution, `SqlDriverAdapter` interface implementation — is unchanged.

Uses `better-sqlite3-sqlcipher` (drop-in replacement for `better-sqlite3` with SQLCipher compiled in).

### `src/db/openDatabase.ts` (new)

Owns the full database open + migration sequence:

1. Open with `better-sqlite3-sqlcipher`
2. Apply `PRAGMA key`
3. Probe by running `SELECT count(*) FROM sqlite_master`:
   - Success → DB is correctly keyed (was already encrypted or this is a new file)
   - Throws → DB is plaintext; proceed to migration.
   - Note: a wrong key also throws — but in this flow K is always correct (derived from the password the user just proved, or from the OS keychain). Any failure here is therefore unambiguously a plaintext DB, not a key mismatch.
4. **Migration (plaintext → SQLCipher)**:
   ```sql
   ATTACH DATABASE '/path/to/tmp_enc.db' AS encrypted KEY "x'<key>'";
   SELECT sqlcipher_export('encrypted');
   DETACH DATABASE encrypted;
   ```
   Then `fs.renameSync('tmp_enc.db', 'corebooks.db')`. Atomic on POSIX. On Windows, delete original first then rename.
5. Return the keyed `Database` instance.

Exports: `openDatabase(filePath: string, key: string): Database`

### `src/db/client.ts` (modified)

Remove `PrismaBetterSqlite3` import. Add `openDatabase` import and `SqlCipherAdapter` import. In `createPrismaClient()`:

```typescript
const key = process.env['COREBOOKS_DB_KEY'] ?? ''
const db = openDatabase(filePath, key)
const adapter = new SqlCipherAdapter({ url: filePath }, db)
return new PrismaClient({ adapter })
```

PostgreSQL path unchanged — key is only applied for SQLite.

### `src/db/ensureSchema.ts` (modified)

Signature change: `ensureSchema(db: Database): void` instead of `ensureSchema(dbPath: string): void`.

Internally already runs raw SQL statements. No logic changes — just remove the internal `new Database(dbPath)` call and use the passed instance directly.

`src/api/bootstrap.ts` updated to pass the keyed DB instance to `ensureSchema` (obtained from `openDatabase`).

### `src/electron/main.ts` (modified)

**`startApiForVault` changes:**

1. After setting `DATABASE_URL`, call `getOrCreateEncryptionKey(userData)` as before (sets `COREBOOKS_DB_KEY`).
2. If vault has encryption (password set) and `COREBOOKS_DB_KEY` is not yet the vault K: the unlock IPC handler (below) has already resolved K before `startApiForVault` is called — no change needed here.

**New IPC handler: `vault:unlock`**

```typescript
ipcMain.handle('vault:unlock', async (_e, password: string) => {
  // 1. Load encryption from vaultManager
  // 2. Argon2id derive slot key from password
  // 3. AES-256-GCM unwrap slot A → vault key K
  // 4. Set process.env['COREBOOKS_DB_KEY'] = K.toString('hex')
  // 5. Call startApiForVault(selectedVaultPath)
  // 6. Send 'vault:ready' to renderer
})
```

Password-protected vault selection flow:
1. `vault:select` IPC: checks if vault has encryption → returns `{ needsPassword: true }` instead of starting API immediately
2. `vault:unlock` IPC: derives K, sets env var, calls `startApiForVault`

**`vault:getState` additions:**

`VaultState` gains `needsPassword: boolean`. Renderer uses this to decide whether to show `UnlockVaultModal` after vault selection.

### `src/ui/components/UnlockVaultModal.tsx` (new)

Modal overlaid on `VaultPickerPage`. Not full-screen — centered card, dismissable.

- Single password input (`type="password"`, `autoComplete="current-password"`)
- Submit + Cancel buttons
- Cancel: closes modal, vault deselected (user returns to vault grid)
- Submit: calls `window.electronAPI.vault.unlock(password)`
  - On success: modal closes, app loads normally (vault:ready fires)
  - On failure: inline "Incorrect password" error, input stays focused, password cleared
- Disabled state during submission (spinner on button, inputs locked)

### `src/ui/pages/VaultPickerPage.tsx` (modified)

After `vault:select` resolves:
- If response indicates `needsPassword`: set local state to show `UnlockVaultModal`
- Otherwise: existing flow (wait for vault:ready)

### `src/electron/preload.ts` + `src/ui/electron.d.ts` (modified)

Add `vault.unlock(password: string): Promise<void>` to IPC surface and type declarations.

### `package.json` + `electron-builder` config (modified)

- Add `better-sqlite3-sqlcipher` to dependencies
- Add to `asarUnpack`: `"node_modules/better-sqlite3-sqlcipher/**"`
- Remove `better-sqlite3` from `asarUnpack` only if it's no longer used directly (keep if `@prisma/adapter-better-sqlite3` still references it — it will, since we keep the original package for PostgreSQL builds to avoid breaking anything)

## Data flow for password-protected vault launch

```
VaultPickerPage
  user clicks vault card
  → vault:select(dirPath)
  ← { needsPassword: true }
  → show UnlockVaultModal

UnlockVaultModal
  user types password → Submit
  → vault:unlock(password)
     main: Argon2id derive
     main: AES-256-GCM unwrap slot A → K
     main: process.env['COREBOOKS_DB_KEY'] = K.hex
     main: openDatabase(dbPath, K.hex)   ← SQLCipher opens
     main: ensureSchema(db)
     main: startServer(port)
     main: send vault:ready
  ← void (success)
  modal closes, app loads

  on error:
  ← throws 'Password is incorrect'
  show inline error
```

## Migration (plaintext → SQLCipher)

Triggered automatically on first open after Plan F ships, inside `openDatabase`:

1. Open file with SQLCipher + key → throws on plaintext DB
2. Re-open with no key to read plaintext
3. Run `sqlcipher_export` to a temp file alongside the DB
4. Close connections
5. `fs.renameSync` temp → original (atomic)
6. Re-open with key → return instance

No user interaction. Transparent for non-password vaults. For password-protected vaults, migration happens immediately after the user enters their password — the DB is encrypted with the same K they just proved they know.

## Error handling

| Scenario | Behaviour |
|---|---|
| Wrong password in UnlockVaultModal | Inline error, no crash, modal stays open |
| OS keychain unavailable, no password set | DB opens without key (graceful degradation, same as today) |
| Migration fails midway (disk full, crash) | Original plaintext DB intact (temp file abandoned), app retries next launch |
| `COREBOOKS_DB_KEY` empty on SQLite path | Open without key — vault remains unencrypted, no crash |

## Testing

- Unit: `openDatabase` with a temp file — round-trip write/read, wrong-key rejection, plaintext migration
- Unit: `SqlCipherAdapter` constructor accepts pre-opened instance (smoke test, no Prisma needed)
- Integration: full `startApiForVault` with a keyed DB — `GET /health` returns 200
- UI: `UnlockVaultModal` — correct password proceeds, wrong password shows error, Cancel deselects vault

## Package changes

| Package | Action |
|---|---|
| `better-sqlite3-sqlcipher` | Add to dependencies + asarUnpack |
| `@prisma/adapter-better-sqlite3` | Keep (still used in PostgreSQL mode indirectly; keep to avoid breaking existing import chains) |
| `better-sqlite3` | Keep (peer dep of the above) |

## Known limitations

- `safeStorage` unavailable (Linux without libsecret): `COREBOOKS_DB_KEY` is not set → DB opens without encryption. Amber warning already shown in VaultTab (Phase 11). No regression.
- PostgreSQL mode: SQLCipher is SQLite-only. PostgreSQL has native TLS + server-side encryption. `openDatabase` is never called in PostgreSQL mode.

## Files changed summary

| File | Change |
|---|---|
| `src/db/sqlcipherAdapter.ts` | New — patched copy of official adapter |
| `src/db/openDatabase.ts` | New — key application + migration |
| `src/db/client.ts` | Modified — use SqlCipherAdapter + openDatabase |
| `src/db/ensureSchema.ts` | Modified — accept Database instance not path |
| `src/api/bootstrap.ts` | Modified — pass keyed DB instance to ensureSchema |
| `src/electron/main.ts` | Modified — vault:unlock IPC, vault:select needsPassword |
| `src/electron/preload.ts` | Modified — expose vault.unlock |
| `src/ui/electron.d.ts` | Modified — type vault.unlock |
| `src/ui/components/UnlockVaultModal.tsx` | New — password prompt modal |
| `src/ui/pages/VaultPickerPage.tsx` | Modified — show UnlockVaultModal on needsPassword |
| `package.json` | Modified — add better-sqlite3-sqlcipher |
| `electron-builder` config | Modified — asarUnpack |
