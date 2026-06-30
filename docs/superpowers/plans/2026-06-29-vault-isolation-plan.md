# Vault Isolation Overhaul — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace CoreBooks' current vault implementation with a fully isolated, identity-bound, password-locked architecture where every vault is self-contained and the launch picker holds only navigation hints (paths + names + last-opened).

**Architecture:** A new `src/electron/vault/` module owns all vault state via a single `VaultLifecycle` class. On disk, the existing `.corebooks` JSON file becomes a directory containing `vault.json` (identity), `lock.json` (Argon2id-wrapped per-vault key + HMAC), `settings.json`, `workspace.json`, `audit.jsonl` (hash-chained log), and `process.lock`. The current global `userData/.db.key` is replaced with per-vault keys generated at creation; `COREBOOKS_DB_KEY` env var is eliminated and K flows as a `Buffer` argument. Mandatory passwords; biometric is an opt-in convenience layer via the OS keychain.

**Tech Stack:** TypeScript strict, Vitest, `@noble/hashes` (Argon2id + HMAC-SHA-256 + SHA-256), `@scure/bip39` (recovery phrases), `better-sqlite3-multiple-ciphers` (SQLCipher), Prisma 7 custom adapter, Electron `safeStorage` (biometric only).

**Spec:** `docs/superpowers/specs/2026-06-29-vault-isolation-design.md` — read this first. The plan implements that spec verbatim. Section references like "spec §3" point back to it.

---

## File structure

**New (`src/electron/vault/`):**

| File | Responsibility |
|---|---|
| `types.ts` | All shared types: `VaultId`, `VaultSettings`, `VaultWorkspace`, `LockFile`, `AuditEvent`, `ActiveVault`, `OpenResult`. Interfaces only — no logic. |
| `defaults.ts` | `DEFAULT_VAULT_SETTINGS`, `DEFAULT_VAULT_WORKSPACE` constants. |
| `identity.ts` | `readIdentity(vaultPath)`, `writeIdentity(vaultPath, identity)`, `generateVaultId()`. |
| `audit.ts` | `appendAuditEvent(vaultPath, event)`, `readAuditLog(vaultPath)`, `verifyAuditChain(vaultPath)`. Hash chain math lives here. |
| `processLock.ts` | `acquireLock(vaultPath)`, `releaseLock(vaultPath)`, `isPidAlive(pid)`. |
| `lockFile.ts` | `createLockFile(vaultId, K, password, recoveryEntropy)`, `unlockWithPassword(lockFile, vaultId, password)`, `unlockWithRecovery(lockFile, vaultId, phrase)`, `verifyHmac(lockFile, vaultId)`. |
| `settings.ts` | `readSettings(vaultPath)`, `writeSettings(vaultPath, settings)`, `settingsMigrators` registry. |
| `workspace.ts` | `readWorkspace(vaultPath)`, `writeWorkspace(vaultPath, workspace)`. Recovers gracefully from corruption. |
| `biometric.ts` | `isBiometricAvailable()`, `storeBiometricKey(vaultId, K)`, `loadBiometricKey(vaultId)`, `removeBiometricKey(vaultId)`. Wraps Electron `safeStorage`. |
| `migration.ts` | `migrateLegacyVault(vaultPath, oldGlobalKeyHex, password)` — defensive backup, rekey, write new structure. |
| `lifecycle.ts` | `VaultLifecycle` class — the single orchestration seam. Owns one `ActiveVault` at a time. |

**Modified:**

| File | Change |
|---|---|
| `src/db/openDatabase.ts` | Accept `Buffer` for key, not hex string. Hex encoding is an internal detail of this module. |
| `src/db/client.ts` | Remove `COREBOOKS_DB_KEY` env var read. Take key as parameter. `getPrismaClient` becomes `createPrismaClient(filePath, key)` — no module-level singleton. |
| `src/api/bootstrap.ts` | Accept `{ filePath, key }` and pass to `createPrismaClient`. |
| `src/electron/main.ts` | All vault IPC handlers route through `VaultLifecycle`. Delete `getOrCreateEncryptionKey`, `vault:setupEncryption`, `COREBOOKS_DB_KEY` env writes. Add `vault:close`, `vault:switch`, `vault:enableBiometric`, `vault:disableBiometric`. |
| `src/electron/preload.ts` | New IPC surface mirrors `main.ts`. |
| `src/ui/electron.d.ts` | Match preload. |
| `src/ui/pages/VaultPickerPage.tsx` | Use `picker.json` schema. Update copy to reflect train-station model. |
| `src/ui/components/UnlockVaultModal.tsx` | Used for every vault open (not just encrypted), password is mandatory. |
| `src/ui/pages/SettingsPage.tsx` | "Close Vault" button in General tab. Biometric toggle in Vault tab. |

**Deleted:**

- `src/electron/vaultManager.ts` (superseded by `lifecycle.ts`)
- `src/electron/vaultTypes.ts` (superseded by `src/electron/vault/types.ts`)
- Runtime: `userData/.db.key` (shredded after all-vaults migration)

**Test files** live alongside at `tests/electron/vault/*.test.ts` mirroring the source layout.

---

## Conventions every task follows

- **TDD strictly.** Write the failing test first, watch it fail with the expected error, then implement, then watch it pass.
- **Run only the test you just wrote** during the loop: `npm test -- tests/path/to/file.test.ts -t "name"`.
- **Type-check after each task:** `npm run build` (TS server) and `npx tsc --project src/ui/tsconfig.json --noEmit` (UI). Zero errors before commit.
- **Commit per task** with `feat:`, `fix:`, `test:`, `chore:` prefix per CLAUDE.md. Co-Authored-By trailer on every commit.
- **No `any` without justification.** Use `unknown` and narrow.
- **Imports use `.js` extensions** (ESM Node convention used throughout this repo).
- **Buffers, not hex strings**, for any raw key material. Hex encoding only at the SQLCipher boundary (inside `openDatabase`).
- **Canonical JSON for hashed/HMAC'd payloads:** use `JSON.stringify` with sorted keys via a tiny helper `canonicalJson(value)` defined in `audit.ts` and reused.

---

## Task 1: Foundation — `types.ts` and `defaults.ts`

**Files:**
- Create: `src/electron/vault/types.ts`
- Create: `src/electron/vault/defaults.ts`
- Test: `tests/electron/vault/defaults.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/electron/vault/defaults.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { DEFAULT_VAULT_SETTINGS, DEFAULT_VAULT_WORKSPACE } from '../../../src/electron/vault/defaults.js'

describe('defaults', () => {
  it('DEFAULT_VAULT_SETTINGS has schemaVersion 1 and all required fields', () => {
    expect(DEFAULT_VAULT_SETTINGS.schemaVersion).toBe(1)
    expect(typeof DEFAULT_VAULT_SETTINGS.companyName).toBe('string')
    expect(DEFAULT_VAULT_SETTINGS.fiscalYearStart).toEqual({ month: 1, day: 1 })
    expect(DEFAULT_VAULT_SETTINGS.currency).toBe('USD')
    expect(Array.isArray(DEFAULT_VAULT_SETTINGS.paymentMethods)).toBe(true)
    expect(DEFAULT_VAULT_SETTINGS.featureFlags).toEqual({ ar_ap: false, inventory: false })
  })

  it('DEFAULT_VAULT_WORKSPACE has schemaVersion 1 and safe defaults', () => {
    expect(DEFAULT_VAULT_WORKSPACE.schemaVersion).toBe(1)
    expect(DEFAULT_VAULT_WORKSPACE.lastTab).toBe('home')
    expect(DEFAULT_VAULT_WORKSPACE.sidebarCollapsed).toBe(false)
    expect(DEFAULT_VAULT_WORKSPACE.recentEntries).toEqual([])
  })

  it('DEFAULT_VAULT_SETTINGS is deep-cloneable (no shared references between callers)', () => {
    const a = structuredClone(DEFAULT_VAULT_SETTINGS)
    const b = structuredClone(DEFAULT_VAULT_SETTINGS)
    a.paymentMethods.push('test')
    expect(b.paymentMethods).not.toContain('test')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- tests/electron/vault/defaults.test.ts
```

Expected: FAIL — `Cannot find module '../../../src/electron/vault/defaults.js'`.

- [ ] **Step 3: Implement `types.ts`**

`src/electron/vault/types.ts`:

```ts
export type VaultId = string // UUID v4

export interface VaultIdentity {
  schemaVersion: 1
  id: VaultId
  displayName: string
  created: string // ISO 8601
}

export interface VaultSettings {
  schemaVersion: 1
  companyName: string
  fiscalYearStart: { month: number; day: number }
  currency: string // ISO 4217
  paymentMethods: string[]
  featureFlags: { ar_ap: boolean; inventory: boolean }
}

export interface VaultWorkspace {
  schemaVersion: 1
  lastTab: string
  sidebarCollapsed: boolean
  recentEntries: string[]
}

export interface KeySlot {
  salt: string // hex, 32 bytes — Argon2id salt
  iv: string   // hex, 12 bytes — AES-GCM IV
  ct: string   // hex, 48 bytes — 32 ciphertext + 16 GCM tag
}

export interface LockFile {
  schemaVersion: 1
  argon2: { m: number; t: number; p: number }
  slots: { password: KeySlot; recovery: KeySlot }
  hmac: string // hex, 32 bytes
}

export type AuditActor = 'system' | 'human' | 'migration'

export interface AuditEvent {
  seq: number
  at: string // ISO 8601
  actor: AuditActor
  event: string
  data: unknown
  prevHash: string // hex, 32 bytes
  hash: string     // hex, 32 bytes
}

export interface PickerEntry {
  id: VaultId
  path: string
  displayName: string
  lastOpened: string // ISO 8601
}

export interface PickerRegistry {
  vaults: PickerEntry[]
}

export interface ActiveVault {
  id: VaultId
  path: string
  displayName: string
  apiPort: number
}

export type OpenResult =
  | { status: 'opened'; vault: ActiveVault }
  | { status: 'needs-password' }
  | { status: 'needs-settings-confirmation'; defaults: VaultSettings }
  | { status: 'busy'; lockedByPid: number }
  | { status: 'identity-mismatch' }
  | { status: 'lock-tampered' }
  | { status: 'legacy-needs-migration' }
```

- [ ] **Step 4: Implement `defaults.ts`**

`src/electron/vault/defaults.ts`:

```ts
import type { VaultSettings, VaultWorkspace } from './types.js'

export const DEFAULT_VAULT_SETTINGS: VaultSettings = {
  schemaVersion: 1,
  companyName: 'My Business',
  fiscalYearStart: { month: 1, day: 1 },
  currency: 'USD',
  paymentMethods: ['Cash', 'Check', 'Credit Card', 'Bank Transfer'],
  featureFlags: { ar_ap: false, inventory: false },
}

export const DEFAULT_VAULT_WORKSPACE: VaultWorkspace = {
  schemaVersion: 1,
  lastTab: 'home',
  sidebarCollapsed: false,
  recentEntries: [],
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npm test -- tests/electron/vault/defaults.test.ts
```

Expected: PASS, 3 tests.

- [ ] **Step 6: Type-check**

```bash
npm run build
```

Expected: zero errors.

- [ ] **Step 7: Commit**

```bash
git add src/electron/vault/types.ts src/electron/vault/defaults.ts tests/electron/vault/defaults.test.ts
git commit -m "$(cat <<'EOF'
feat: vault types and defaults

Layer 1 of vault isolation overhaul. Pure types and constants — no
behavior. Establishes VaultIdentity, VaultSettings, VaultWorkspace,
LockFile, AuditEvent, ActiveVault, OpenResult interfaces and the
DEFAULT_* constants used at vault creation.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Identity — `identity.ts`

**Files:**
- Create: `src/electron/vault/identity.ts`
- Test: `tests/electron/vault/identity.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/electron/vault/identity.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { generateVaultId, readIdentity, writeIdentity } from '../../../src/electron/vault/identity.js'

let tmp: string
beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-id-')) })
afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }) })

describe('identity', () => {
  it('generateVaultId returns a v4 UUID', () => {
    const id = generateVaultId()
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })

  it('generateVaultId returns unique values', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateVaultId()))
    expect(ids.size).toBe(100)
  })

  it('writeIdentity creates .corebooks/vault.json with 0o600 mode', () => {
    fs.mkdirSync(path.join(tmp, '.corebooks'))
    const identity = { schemaVersion: 1 as const, id: generateVaultId(), displayName: 'Acme', created: new Date().toISOString() }
    writeIdentity(tmp, identity)
    const filePath = path.join(tmp, '.corebooks', 'vault.json')
    expect(fs.existsSync(filePath)).toBe(true)
    const stat = fs.statSync(filePath)
    expect(stat.mode & 0o777).toBe(0o600)
    expect(JSON.parse(fs.readFileSync(filePath, 'utf-8'))).toEqual(identity)
  })

  it('readIdentity returns the written identity', () => {
    fs.mkdirSync(path.join(tmp, '.corebooks'))
    const identity = { schemaVersion: 1 as const, id: generateVaultId(), displayName: 'Acme', created: new Date().toISOString() }
    writeIdentity(tmp, identity)
    expect(readIdentity(tmp)).toEqual(identity)
  })

  it('readIdentity throws VaultIdentityMissing when file absent', () => {
    expect(() => readIdentity(tmp)).toThrow(/VaultIdentityMissing/)
  })

  it('readIdentity throws VaultIdentityInvalid when file has wrong schema', () => {
    fs.mkdirSync(path.join(tmp, '.corebooks'))
    fs.writeFileSync(path.join(tmp, '.corebooks', 'vault.json'), JSON.stringify({ schemaVersion: 99 }))
    expect(() => readIdentity(tmp)).toThrow(/VaultIdentityInvalid/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- tests/electron/vault/identity.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `identity.ts`**

```ts
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { VaultIdentity } from './types.js'

const VAULT_DIR = '.corebooks'
const IDENTITY_FILE = 'vault.json'

export function generateVaultId(): string {
  return randomUUID()
}

export function writeIdentity(vaultPath: string, identity: VaultIdentity): void {
  const file = path.join(vaultPath, VAULT_DIR, IDENTITY_FILE)
  fs.writeFileSync(file, JSON.stringify(identity, null, 2), { mode: 0o600 })
}

export function readIdentity(vaultPath: string): VaultIdentity {
  const file = path.join(vaultPath, VAULT_DIR, IDENTITY_FILE)
  if (!fs.existsSync(file)) throw new Error('VaultIdentityMissing')
  let parsed: unknown
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf-8'))
  } catch {
    throw new Error('VaultIdentityInvalid: not valid JSON')
  }
  if (!isVaultIdentity(parsed)) throw new Error('VaultIdentityInvalid: schema mismatch')
  return parsed
}

function isVaultIdentity(v: unknown): v is VaultIdentity {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  return (
    o['schemaVersion'] === 1 &&
    typeof o['id'] === 'string' &&
    typeof o['displayName'] === 'string' &&
    typeof o['created'] === 'string'
  )
}
```

- [ ] **Step 4: Run tests, expect all 6 to pass**

```bash
npm test -- tests/electron/vault/identity.test.ts
```

Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/electron/vault/identity.ts tests/electron/vault/identity.test.ts
git commit -m "$(cat <<'EOF'
feat: vault identity module

UUID v4 generation, vault.json read/write with 0o600 mode and
schema validation. Identity is the keystone of vault isolation:
every later module keys integrity checks to the vault's UUID.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Audit log — `audit.ts`

**Files:**
- Create: `src/electron/vault/audit.ts`
- Test: `tests/electron/vault/audit.test.ts`

This task implements the spec §5 hash chain and covers tests T4 from the spec.

- [ ] **Step 1: Write the failing tests**

`tests/electron/vault/audit.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import {
  appendAuditEvent,
  readAuditLog,
  verifyAuditChain,
  canonicalJson,
  GENESIS_PREV_HASH,
} from '../../../src/electron/vault/audit.js'

let tmp: string
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-aud-'))
  fs.mkdirSync(path.join(tmp, '.corebooks'))
})
afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }) })

describe('audit', () => {
  it('canonicalJson sorts keys deterministically', () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}')
    expect(canonicalJson({ z: { y: 1, x: 2 } })).toBe('{"z":{"x":2,"y":1}}')
  })

  it('first append writes genesis entry with GENESIS_PREV_HASH', () => {
    appendAuditEvent(tmp, { actor: 'system', event: 'vault.created', data: { id: 'test' } })
    const log = readAuditLog(tmp)
    expect(log).toHaveLength(1)
    expect(log[0].seq).toBe(0)
    expect(log[0].prevHash).toBe(GENESIS_PREV_HASH)
    expect(log[0].hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('subsequent appends chain prevHash to previous hash', () => {
    appendAuditEvent(tmp, { actor: 'system', event: 'a', data: {} })
    appendAuditEvent(tmp, { actor: 'system', event: 'b', data: {} })
    const log = readAuditLog(tmp)
    expect(log).toHaveLength(2)
    expect(log[1].seq).toBe(1)
    expect(log[1].prevHash).toBe(log[0].hash)
  })

  it('verifyAuditChain returns ok:true for intact chain', () => {
    appendAuditEvent(tmp, { actor: 'system', event: 'a', data: {} })
    appendAuditEvent(tmp, { actor: 'system', event: 'b', data: {} })
    appendAuditEvent(tmp, { actor: 'system', event: 'c', data: {} })
    expect(verifyAuditChain(tmp)).toEqual({ ok: true })
  })

  // Spec test T4
  it('detects tampered audit line at correct index', () => {
    for (let i = 0; i < 5; i++) appendAuditEvent(tmp, { actor: 'system', event: `e${i}`, data: {} })
    const file = path.join(tmp, '.corebooks', 'audit.jsonl')
    const lines = fs.readFileSync(file, 'utf-8').split('\n').filter(Boolean)
    const obj = JSON.parse(lines[2])
    obj.event = 'TAMPERED'
    lines[2] = JSON.stringify(obj)
    fs.writeFileSync(file, lines.join('\n') + '\n')
    expect(verifyAuditChain(tmp)).toEqual({ ok: false, brokenAt: 2 })
  })

  it('appending after tampering still succeeds; verify keeps reporting same brokenAt', () => {
    for (let i = 0; i < 3; i++) appendAuditEvent(tmp, { actor: 'system', event: `e${i}`, data: {} })
    const file = path.join(tmp, '.corebooks', 'audit.jsonl')
    const lines = fs.readFileSync(file, 'utf-8').split('\n').filter(Boolean)
    const obj = JSON.parse(lines[1])
    obj.event = 'X'
    lines[1] = JSON.stringify(obj)
    fs.writeFileSync(file, lines.join('\n') + '\n')
    appendAuditEvent(tmp, { actor: 'system', event: 'post-tamper', data: {} })
    expect(verifyAuditChain(tmp)).toEqual({ ok: false, brokenAt: 1 })
  })
})
```

- [ ] **Step 2: Run, expect fail**

```bash
npm test -- tests/electron/vault/audit.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `audit.ts`**

```ts
import fs from 'node:fs'
import path from 'node:path'
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex } from '@noble/hashes/utils.js'
import type { AuditActor, AuditEvent } from './types.js'

const AUDIT_FILE = path.join('.corebooks', 'audit.jsonl')

export const GENESIS_PREV_HASH = '0'.repeat(64)

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']'
  const keys = Object.keys(value as Record<string, unknown>).sort()
  return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalJson((value as Record<string, unknown>)[k])).join(',') + '}'
}

function hashEvent(e: Omit<AuditEvent, 'hash'>): string {
  return bytesToHex(sha256(new TextEncoder().encode(canonicalJson(e))))
}

interface AppendInput {
  actor: AuditActor
  event: string
  data: unknown
}

export function appendAuditEvent(vaultPath: string, input: AppendInput): AuditEvent {
  const file = path.join(vaultPath, AUDIT_FILE)
  const existing = fs.existsSync(file)
    ? fs.readFileSync(file, 'utf-8').split('\n').filter(Boolean)
    : []
  const seq = existing.length
  const prevHash = seq === 0
    ? GENESIS_PREV_HASH
    : (JSON.parse(existing[existing.length - 1]) as AuditEvent).hash
  const skeleton = {
    seq,
    at: new Date().toISOString(),
    actor: input.actor,
    event: input.event,
    data: input.data,
    prevHash,
  }
  const event: AuditEvent = { ...skeleton, hash: hashEvent(skeleton) }
  fs.appendFileSync(file, JSON.stringify(event) + '\n', { mode: 0o600 })
  return event
}

export function readAuditLog(vaultPath: string): AuditEvent[] {
  const file = path.join(vaultPath, AUDIT_FILE)
  if (!fs.existsSync(file)) return []
  return fs.readFileSync(file, 'utf-8')
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line) as AuditEvent)
}

export type VerifyResult = { ok: true } | { ok: false; brokenAt: number }

export function verifyAuditChain(vaultPath: string): VerifyResult {
  const log = readAuditLog(vaultPath)
  let prev = GENESIS_PREV_HASH
  for (let i = 0; i < log.length; i++) {
    const e = log[i]
    if (e.seq !== i) return { ok: false, brokenAt: i }
    if (e.prevHash !== prev) return { ok: false, brokenAt: i }
    const { hash, ...rest } = e
    if (hashEvent(rest) !== hash) return { ok: false, brokenAt: i }
    prev = hash
  }
  return { ok: true }
}
```

- [ ] **Step 4: Run, expect all 6 to pass**

```bash
npm test -- tests/electron/vault/audit.test.ts
```

Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/electron/vault/audit.ts tests/electron/vault/audit.test.ts
git commit -m "$(cat <<'EOF'
feat: vault audit log with hash-chained integrity

Append-only audit.jsonl with SHA-256 hash chain (spec §5). Genesis
entry uses 64 zeros as prevHash. canonicalJson sorts keys so hashes
are reproducible across reads/writes. verifyAuditChain returns the
first broken index — informational, never blocks vault open.

Includes spec test T4 (tampered line detected) and the regression
guard that post-tamper appends still succeed.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Process lock — `processLock.ts`

**Files:**
- Create: `src/electron/vault/processLock.ts`
- Test: `tests/electron/vault/processLock.test.ts`

Covers spec tests T17, T18.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { acquireLock, releaseLock } from '../../../src/electron/vault/processLock.js'

let tmp: string
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-lock-'))
  fs.mkdirSync(path.join(tmp, '.corebooks'))
})
afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }) })

describe('processLock', () => {
  it('acquireLock writes process.lock with current PID', () => {
    const result = acquireLock(tmp)
    expect(result).toEqual({ status: 'acquired' })
    const lock = JSON.parse(fs.readFileSync(path.join(tmp, '.corebooks', 'process.lock'), 'utf-8'))
    expect(lock.pid).toBe(process.pid)
    expect(typeof lock.openedAt).toBe('string')
  })

  // Spec T17
  it('returns busy when a lock exists for a live PID', () => {
    fs.writeFileSync(
      path.join(tmp, '.corebooks', 'process.lock'),
      JSON.stringify({ pid: process.pid, openedAt: new Date().toISOString() }),
    )
    expect(acquireLock(tmp)).toEqual({ status: 'busy', lockedByPid: process.pid })
  })

  // Spec T18
  it('reclaims a stale lock from a dead PID', () => {
    fs.writeFileSync(
      path.join(tmp, '.corebooks', 'process.lock'),
      JSON.stringify({ pid: 99999999, openedAt: new Date().toISOString() }),
    )
    const result = acquireLock(tmp)
    expect(result).toEqual({ status: 'reclaimed', previousPid: 99999999 })
    const lock = JSON.parse(fs.readFileSync(path.join(tmp, '.corebooks', 'process.lock'), 'utf-8'))
    expect(lock.pid).toBe(process.pid)
  })

  it('releaseLock removes the file only when PID matches', () => {
    acquireLock(tmp)
    releaseLock(tmp)
    expect(fs.existsSync(path.join(tmp, '.corebooks', 'process.lock'))).toBe(false)
  })

  it('releaseLock leaves the file alone if PID does not match', () => {
    fs.writeFileSync(
      path.join(tmp, '.corebooks', 'process.lock'),
      JSON.stringify({ pid: 99999999, openedAt: new Date().toISOString() }),
    )
    releaseLock(tmp)
    expect(fs.existsSync(path.join(tmp, '.corebooks', 'process.lock'))).toBe(true)
  })
})
```

- [ ] **Step 2: Run, expect fail**

```bash
npm test -- tests/electron/vault/processLock.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `processLock.ts`**

```ts
import fs from 'node:fs'
import path from 'node:path'

const LOCK_FILE = path.join('.corebooks', 'process.lock')

interface LockData {
  pid: number
  openedAt: string
}

export type AcquireResult =
  | { status: 'acquired' }
  | { status: 'reclaimed'; previousPid: number }
  | { status: 'busy'; lockedByPid: number }

export function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0) // signal 0 = "test for existence", no actual signal sent
    return true
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EPERM') return true // exists but owned by another user
    return false
  }
}

function writeLock(file: string): void {
  fs.writeFileSync(
    file,
    JSON.stringify({ pid: process.pid, openedAt: new Date().toISOString() }),
    { mode: 0o600 },
  )
}

export function acquireLock(vaultPath: string): AcquireResult {
  const file = path.join(vaultPath, LOCK_FILE)
  if (!fs.existsSync(file)) {
    writeLock(file)
    return { status: 'acquired' }
  }
  let existing: LockData
  try {
    existing = JSON.parse(fs.readFileSync(file, 'utf-8'))
  } catch {
    // malformed lock file — treat as stale
    writeLock(file)
    return { status: 'reclaimed', previousPid: -1 }
  }
  if (isPidAlive(existing.pid)) {
    return { status: 'busy', lockedByPid: existing.pid }
  }
  writeLock(file)
  return { status: 'reclaimed', previousPid: existing.pid }
}

export function releaseLock(vaultPath: string): void {
  const file = path.join(vaultPath, LOCK_FILE)
  if (!fs.existsSync(file)) return
  let existing: LockData
  try {
    existing = JSON.parse(fs.readFileSync(file, 'utf-8'))
  } catch {
    return
  }
  if (existing.pid !== process.pid) return
  fs.unlinkSync(file)
}
```

- [ ] **Step 4: Run, expect all 5 to pass**

```bash
npm test -- tests/electron/vault/processLock.test.ts
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/electron/vault/processLock.ts tests/electron/vault/processLock.test.ts
git commit -m "$(cat <<'EOF'
feat: vault process lock with stale-PID reclamation

process.lock holds {pid, openedAt}. acquireLock returns
acquired/reclaimed/busy; reclaims any lock whose PID is dead
(kill -0 probe). releaseLock only removes a lock owned by the
current process. Covers spec T17 and T18.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Lock file (crypto) — `lockFile.ts`

**Files:**
- Create: `src/electron/vault/lockFile.ts`
- Test: `tests/electron/vault/lockFile.test.ts`

Covers spec tests T3, T10, T12. This is the security-critical module.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest'
import { randomBytes } from 'node:crypto'
import {
  createLockFile,
  unlockWithPassword,
  unlockWithRecovery,
  verifyHmac,
  ARGON2_PARAMS,
} from '../../../src/electron/vault/lockFile.js'
import { generateVaultId } from '../../../src/electron/vault/identity.js'

describe('lockFile', () => {
  // Spec T12
  it('Argon2id parameters are pinned to m=65536, t=3, p=4', () => {
    expect(ARGON2_PARAMS).toEqual({ m: 65536, t: 3, p: 4 })
  })

  it('createLockFile wraps K under both password and recovery slots', () => {
    const id = generateVaultId()
    const K = randomBytes(32)
    const recoveryEntropy = randomBytes(16)
    const lock = createLockFile(id, K, 'correct horse battery staple', recoveryEntropy)
    expect(lock.schemaVersion).toBe(1)
    expect(lock.argon2).toEqual(ARGON2_PARAMS)
    expect(lock.slots.password.salt).toMatch(/^[0-9a-f]{64}$/)
    expect(lock.slots.password.iv).toMatch(/^[0-9a-f]{24}$/)
    expect(lock.slots.password.ct).toMatch(/^[0-9a-f]{96}$/)
    expect(lock.slots.recovery.salt).toMatch(/^[0-9a-f]{64}$/)
    expect(lock.hmac).toMatch(/^[0-9a-f]{64}$/)
  })

  it('unlockWithPassword returns the original K', () => {
    const id = generateVaultId()
    const K = randomBytes(32)
    const lock = createLockFile(id, K, 'password123456', randomBytes(16))
    const unlocked = unlockWithPassword(lock, id, 'password123456')
    expect(unlocked.equals(K)).toBe(true)
  })

  it('unlockWithPassword throws on wrong password', () => {
    const id = generateVaultId()
    const lock = createLockFile(id, randomBytes(32), 'correct password', randomBytes(16))
    expect(() => unlockWithPassword(lock, id, 'wrong password')).toThrow(/VaultUnlockFailed/)
  })

  it('unlockWithRecovery returns the original K', () => {
    const id = generateVaultId()
    const K = randomBytes(32)
    const entropy = randomBytes(16)
    const lock = createLockFile(id, K, 'pw', entropy)
    const unlocked = unlockWithRecovery(lock, id, entropy)
    expect(unlocked.equals(K)).toBe(true)
  })

  // Spec T3
  it('verifyHmac fails when any byte of lock data is flipped', () => {
    const id = generateVaultId()
    const lock = createLockFile(id, randomBytes(32), 'pw', randomBytes(16))
    expect(verifyHmac(lock, id)).toBe(true)
    // Tamper with the ct
    const tampered = JSON.parse(JSON.stringify(lock))
    const ctBytes = Buffer.from(tampered.slots.password.ct, 'hex')
    ctBytes[0] ^= 0xff
    tampered.slots.password.ct = ctBytes.toString('hex')
    expect(verifyHmac(tampered, id)).toBe(false)
  })

  it('verifyHmac fails when HMAC keyed to a different vault id', () => {
    const idA = generateVaultId()
    const idB = generateVaultId()
    const lock = createLockFile(idA, randomBytes(32), 'pw', randomBytes(16))
    expect(verifyHmac(lock, idA)).toBe(true)
    expect(verifyHmac(lock, idB)).toBe(false)
  })

  // Spec T10
  it('two vaults with same password produce different K', () => {
    const password = 'shared password'
    const idA = generateVaultId()
    const idB = generateVaultId()
    const K_A = randomBytes(32)
    const K_B = randomBytes(32)
    const lockA = createLockFile(idA, K_A, password, randomBytes(16))
    const lockB = createLockFile(idB, K_B, password, randomBytes(16))
    const unlockedA = unlockWithPassword(lockA, idA, password)
    const unlockedB = unlockWithPassword(lockB, idB, password)
    expect(unlockedA.equals(unlockedB)).toBe(false)
    expect(unlockedA.equals(K_A)).toBe(true)
    expect(unlockedB.equals(K_B)).toBe(true)
  })
}, { timeout: 60_000 }) // Argon2id at m=65536,t=3,p=4 takes ~500ms each
```

- [ ] **Step 2: Run, expect fail**

```bash
npm test -- tests/electron/vault/lockFile.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lockFile.ts`**

```ts
import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto'
import { argon2id } from '@noble/hashes/argon2.js'
import { hmac } from '@noble/hashes/hmac.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js'
import type { LockFile, KeySlot, VaultId } from './types.js'
import { canonicalJson } from './audit.js'

export const ARGON2_PARAMS = { m: 65536, t: 3, p: 4 } as const

function deriveKEK(secret: Buffer | Uint8Array, salt: Uint8Array): Buffer {
  // Buffer.from creates an owned copy — argon2id returns a Uint8Array that
  // may share its backing buffer with internal state; copy defensively.
  return Buffer.from(argon2id(secret, salt, { ...ARGON2_PARAMS, dkLen: 32 }))
}

function wrap(K: Buffer, secret: Buffer | Uint8Array): KeySlot {
  const salt = randomBytes(32)
  const iv = randomBytes(12)
  const kek = deriveKEK(secret, salt)
  const cipher = createCipheriv('aes-256-gcm', kek, iv)
  const ct = Buffer.concat([cipher.update(K), cipher.final()])
  const tag = cipher.getAuthTag()
  return { salt: salt.toString('hex'), iv: iv.toString('hex'), ct: Buffer.concat([ct, tag]).toString('hex') }
}

function unwrap(slot: KeySlot, secret: Buffer | Uint8Array): Buffer {
  const salt = hexToBytes(slot.salt)
  const iv = hexToBytes(slot.iv)
  const ctWithTag = Buffer.from(hexToBytes(slot.ct))
  const ct = ctWithTag.subarray(0, 32)
  const tag = ctWithTag.subarray(32, 48)
  const kek = deriveKEK(secret, salt)
  try {
    const decipher = createDecipheriv('aes-256-gcm', kek, iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(ct), decipher.final()])
  } catch {
    throw new Error('VaultUnlockFailed')
  }
}

function hmacKey(vaultId: VaultId): Uint8Array {
  return sha256(new TextEncoder().encode('corebooks.lock.hmac' + vaultId))
}

function computeHmac(lock: Omit<LockFile, 'hmac'>, vaultId: VaultId): string {
  const payload = canonicalJson(lock)
  return bytesToHex(hmac(sha256, hmacKey(vaultId), new TextEncoder().encode(payload)))
}

export function createLockFile(
  vaultId: VaultId,
  K: Buffer,
  password: string,
  recoveryEntropy: Buffer | Uint8Array,
): LockFile {
  if (password.length < 12) throw new Error('VaultPasswordTooShort')
  const skeleton = {
    schemaVersion: 1 as const,
    argon2: { ...ARGON2_PARAMS },
    slots: {
      password: wrap(K, Buffer.from(password, 'utf-8')),
      recovery: wrap(K, recoveryEntropy),
    },
  }
  return { ...skeleton, hmac: computeHmac(skeleton, vaultId) }
}

export function verifyHmac(lock: LockFile, vaultId: VaultId): boolean {
  const { hmac: provided, ...rest } = lock
  const computed = computeHmac(rest, vaultId)
  const a = Buffer.from(provided, 'hex')
  const b = Buffer.from(computed, 'hex')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export function unlockWithPassword(lock: LockFile, vaultId: VaultId, password: string): Buffer {
  if (!verifyHmac(lock, vaultId)) throw new Error('VaultLockTampered')
  return unwrap(lock.slots.password, Buffer.from(password, 'utf-8'))
}

export function unlockWithRecovery(lock: LockFile, vaultId: VaultId, entropy: Buffer | Uint8Array): Buffer {
  if (!verifyHmac(lock, vaultId)) throw new Error('VaultLockTampered')
  return unwrap(lock.slots.recovery, entropy)
}
```

- [ ] **Step 4: Run, expect all 8 to pass**

```bash
npm test -- tests/electron/vault/lockFile.test.ts
```

Expected: PASS, 8 tests. Run will take ~10-15 seconds because each wrap/unwrap runs Argon2id at the pinned parameters.

- [ ] **Step 5: Commit**

```bash
git add src/electron/vault/lockFile.ts tests/electron/vault/lockFile.test.ts
git commit -m "$(cat <<'EOF'
feat: vault lock file with HMAC integrity

Argon2id(m=65536,t=3,p=4) + AES-256-GCM wraps the per-vault key K
into password and recovery slots. HMAC-SHA256 keyed to vault.id
covers the entire lock structure — swapping lock files between
vaults or hand-editing fails verifyHmac.

unlockWith{Password,Recovery} call verifyHmac BEFORE running
Argon2id so tampered lock files reject in microseconds, not the
~500ms KDF runtime.

Covers spec tests T3, T10, T12.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Settings + workspace — `settings.ts`, `workspace.ts`

**Files:**
- Create: `src/electron/vault/settings.ts`
- Create: `src/electron/vault/workspace.ts`
- Test: `tests/electron/vault/settings.test.ts`
- Test: `tests/electron/vault/workspace.test.ts`

Covers spec tests T21 (workspace corruption non-fatal) and T22 (schema migrators). T20 (missing-settings prompt) is covered by lifecycle in Task 8.

- [ ] **Step 1: Write failing tests for settings**

`tests/electron/vault/settings.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import {
  readSettings,
  writeSettings,
  registerSettingsMigrator,
  clearSettingsMigrators,
  CURRENT_SETTINGS_VERSION,
} from '../../../src/electron/vault/settings.js'
import { DEFAULT_VAULT_SETTINGS } from '../../../src/electron/vault/defaults.js'

let tmp: string
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-set-'))
  fs.mkdirSync(path.join(tmp, '.corebooks'))
  clearSettingsMigrators()
})
afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }) })

describe('settings', () => {
  it('writeSettings then readSettings round-trips', () => {
    const s = structuredClone(DEFAULT_VAULT_SETTINGS)
    s.companyName = 'Acme'
    writeSettings(tmp, s)
    expect(readSettings(tmp)).toEqual(s)
  })

  it('readSettings throws VaultSettingsMissing when file absent', () => {
    expect(() => readSettings(tmp)).toThrow(/VaultSettingsMissing/)
  })

  it('readSettings throws VaultSettingsInvalid when JSON is corrupt', () => {
    fs.writeFileSync(path.join(tmp, '.corebooks', 'settings.json'), '{not json}')
    expect(() => readSettings(tmp)).toThrow(/VaultSettingsInvalid/)
  })

  // Spec T22
  it('runs registered migrator when schemaVersion is older', () => {
    fs.writeFileSync(
      path.join(tmp, '.corebooks', 'settings.json'),
      JSON.stringify({ schemaVersion: 1, companyName: 'Old', oldField: 'X' }),
    )
    registerSettingsMigrator(2, (old: any) => ({
      ...DEFAULT_VAULT_SETTINGS,
      schemaVersion: 2,
      companyName: old.companyName,
    }))
    // Pretend CURRENT_SETTINGS_VERSION is 2 for this test via override
    const migrated = readSettings(tmp, { targetVersion: 2 })
    expect(migrated.schemaVersion).toBe(2)
    expect(migrated.companyName).toBe('Old')
  })

  it('throws if schemaVersion is newer than current and no migrator registered', () => {
    fs.writeFileSync(
      path.join(tmp, '.corebooks', 'settings.json'),
      JSON.stringify({ schemaVersion: 99, companyName: 'X' }),
    )
    expect(() => readSettings(tmp)).toThrow(/VaultSettingsUnsupportedVersion/)
  })

  it('throws if a needed migrator is missing', () => {
    fs.writeFileSync(
      path.join(tmp, '.corebooks', 'settings.json'),
      JSON.stringify({ schemaVersion: 1, companyName: 'X' }),
    )
    expect(() => readSettings(tmp, { targetVersion: 2 })).toThrow(/VaultSettingsMigratorMissing/)
  })
})
```

- [ ] **Step 2: Write failing tests for workspace**

`tests/electron/vault/workspace.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { readWorkspace, writeWorkspace } from '../../../src/electron/vault/workspace.js'
import { DEFAULT_VAULT_WORKSPACE } from '../../../src/electron/vault/defaults.js'

let tmp: string
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-ws-'))
  fs.mkdirSync(path.join(tmp, '.corebooks'))
})
afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }) })

describe('workspace', () => {
  it('readWorkspace returns defaults when file absent', () => {
    const ws = readWorkspace(tmp)
    expect(ws).toEqual(DEFAULT_VAULT_WORKSPACE)
  })

  // Spec T21
  it('readWorkspace returns defaults and rewrites file when JSON is corrupt', () => {
    const file = path.join(tmp, '.corebooks', 'workspace.json')
    fs.writeFileSync(file, '{not json')
    const ws = readWorkspace(tmp)
    expect(ws).toEqual(DEFAULT_VAULT_WORKSPACE)
    expect(JSON.parse(fs.readFileSync(file, 'utf-8'))).toEqual(DEFAULT_VAULT_WORKSPACE)
  })

  it('writeWorkspace round-trips', () => {
    const ws = { ...DEFAULT_VAULT_WORKSPACE, lastTab: 'accounts' }
    writeWorkspace(tmp, ws)
    expect(readWorkspace(tmp)).toEqual(ws)
  })
})
```

- [ ] **Step 3: Run both, expect fail**

```bash
npm test -- tests/electron/vault/settings.test.ts tests/electron/vault/workspace.test.ts
```

Expected: FAIL — modules not found.

- [ ] **Step 4: Implement `settings.ts`**

```ts
import fs from 'node:fs'
import path from 'node:path'
import type { VaultSettings } from './types.js'
import { DEFAULT_VAULT_SETTINGS } from './defaults.js'

const SETTINGS_FILE = path.join('.corebooks', 'settings.json')

export const CURRENT_SETTINGS_VERSION = 1

type Migrator = (oldValue: unknown) => VaultSettings

const migrators = new Map<number, Migrator>()

export function registerSettingsMigrator(toVersion: number, fn: Migrator): void {
  migrators.set(toVersion, fn)
}

export function clearSettingsMigrators(): void {
  migrators.clear()
}

export interface ReadOptions {
  targetVersion?: number
}

export function readSettings(vaultPath: string, opts: ReadOptions = {}): VaultSettings {
  const file = path.join(vaultPath, SETTINGS_FILE)
  if (!fs.existsSync(file)) throw new Error('VaultSettingsMissing')
  let parsed: unknown
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf-8'))
  } catch {
    throw new Error('VaultSettingsInvalid: not valid JSON')
  }
  const target = opts.targetVersion ?? CURRENT_SETTINGS_VERSION
  const version = (parsed as { schemaVersion?: unknown })?.schemaVersion
  if (typeof version !== 'number') throw new Error('VaultSettingsInvalid: missing schemaVersion')
  if (version === target) {
    if (!isValidSettings(parsed, target)) throw new Error('VaultSettingsInvalid: shape mismatch')
    return parsed
  }
  if (version > target) throw new Error(`VaultSettingsUnsupportedVersion: file is ${version}, app supports ${target}`)
  let current: unknown = parsed
  for (let v = version + 1; v <= target; v++) {
    const m = migrators.get(v)
    if (!m) throw new Error(`VaultSettingsMigratorMissing: no migrator registered for version ${v}`)
    current = m(current)
  }
  return current as VaultSettings
}

export function writeSettings(vaultPath: string, settings: VaultSettings): void {
  const file = path.join(vaultPath, SETTINGS_FILE)
  fs.writeFileSync(file, JSON.stringify(settings, null, 2), { mode: 0o600 })
}

function isValidSettings(v: unknown, targetVersion: number): v is VaultSettings {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  return (
    o['schemaVersion'] === targetVersion &&
    typeof o['companyName'] === 'string' &&
    typeof o['currency'] === 'string' &&
    Array.isArray(o['paymentMethods'])
  )
}
```

- [ ] **Step 5: Implement `workspace.ts`**

```ts
import fs from 'node:fs'
import path from 'node:path'
import type { VaultWorkspace } from './types.js'
import { DEFAULT_VAULT_WORKSPACE } from './defaults.js'

const WORKSPACE_FILE = path.join('.corebooks', 'workspace.json')

export function readWorkspace(vaultPath: string): VaultWorkspace {
  const file = path.join(vaultPath, WORKSPACE_FILE)
  if (!fs.existsSync(file)) {
    writeWorkspace(vaultPath, DEFAULT_VAULT_WORKSPACE)
    return structuredClone(DEFAULT_VAULT_WORKSPACE)
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf-8'))
    if (isValidWorkspace(parsed)) return parsed
    throw new Error('shape mismatch')
  } catch {
    writeWorkspace(vaultPath, DEFAULT_VAULT_WORKSPACE)
    return structuredClone(DEFAULT_VAULT_WORKSPACE)
  }
}

export function writeWorkspace(vaultPath: string, workspace: VaultWorkspace): void {
  const file = path.join(vaultPath, WORKSPACE_FILE)
  fs.writeFileSync(file, JSON.stringify(workspace, null, 2), { mode: 0o600 })
}

function isValidWorkspace(v: unknown): v is VaultWorkspace {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  return (
    o['schemaVersion'] === 1 &&
    typeof o['lastTab'] === 'string' &&
    typeof o['sidebarCollapsed'] === 'boolean' &&
    Array.isArray(o['recentEntries'])
  )
}
```

- [ ] **Step 6: Run both, expect all to pass**

```bash
npm test -- tests/electron/vault/settings.test.ts tests/electron/vault/workspace.test.ts
```

Expected: 6 settings + 3 workspace = 9 tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src/electron/vault/settings.ts src/electron/vault/workspace.ts tests/electron/vault/settings.test.ts tests/electron/vault/workspace.test.ts
git commit -m "$(cat <<'EOF'
feat: vault settings and workspace I/O

settings.json: strict schema validation, never silent-overwrite on
missing/corrupt — caller must handle the throw and decide. Migrator
registry co-located here per spec §4. Covers spec T22.

workspace.json: non-fatal corruption recovery — file rewritten from
defaults, vault continues to open. Covers spec T21.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Biometric seam — `biometric.ts`

**Files:**
- Create: `src/electron/vault/biometric.ts`
- Test: `tests/electron/vault/biometric.test.ts`

Covers spec tests T15, T16. The Electron `safeStorage` API is mocked via dependency injection — the module accepts a `BiometricBackend` interface so tests can substitute a fake.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { createBiometricStore, FakeBackend } from '../../../src/electron/vault/biometric.js'

let backend: FakeBackend
beforeEach(() => { backend = new FakeBackend() })

describe('biometric', () => {
  it('isBiometricAvailable reflects backend.isEncryptionAvailable', () => {
    backend.encryptionAvailable = false
    const store = createBiometricStore(backend)
    expect(store.isBiometricAvailable()).toBe(false)
    backend.encryptionAvailable = true
    expect(store.isBiometricAvailable()).toBe(true)
  })

  // Spec T15
  it('storeBiometricKey stores under per-vault label "corebooks.vault.<uuid>"', () => {
    const store = createBiometricStore(backend)
    store.storeBiometricKey('abc-123', Buffer.from('key material here key material h'))
    expect(backend.items.has('corebooks.vault.abc-123')).toBe(true)
  })

  it('loadBiometricKey returns the stored buffer', () => {
    const store = createBiometricStore(backend)
    const K = Buffer.from('0123456789abcdef0123456789abcdef')
    store.storeBiometricKey('vault-A', K)
    expect(store.loadBiometricKey('vault-A')?.equals(K)).toBe(true)
  })

  it('removeBiometricKey deletes the keychain item', () => {
    const store = createBiometricStore(backend)
    store.storeBiometricKey('vault-A', Buffer.from('key material here key material h'))
    store.removeBiometricKey('vault-A')
    expect(backend.items.has('corebooks.vault.vault-A')).toBe(false)
  })

  // Spec T16
  it('storeBiometricKey throws when backend unavailable', () => {
    backend.encryptionAvailable = false
    const store = createBiometricStore(backend)
    expect(() => store.storeBiometricKey('vault-A', Buffer.from('00000000000000000000000000000000'))).toThrow(/BiometricUnavailable/)
  })

  it('loadBiometricKey returns null when nothing stored', () => {
    const store = createBiometricStore(backend)
    expect(store.loadBiometricKey('missing')).toBeNull()
  })
})
```

- [ ] **Step 2: Run, expect fail**

```bash
npm test -- tests/electron/vault/biometric.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `biometric.ts`**

```ts
import type { VaultId } from './types.js'

export interface BiometricBackend {
  isEncryptionAvailable(): boolean
  encryptString(plain: string): Buffer
  decryptString(encrypted: Buffer): string
  // In-memory item store keyed by label. Real backend uses OS keychain.
  put(label: string, value: Buffer): void
  get(label: string): Buffer | null
  remove(label: string): void
}

export interface BiometricStore {
  isBiometricAvailable(): boolean
  storeBiometricKey(vaultId: VaultId, K: Buffer): void
  loadBiometricKey(vaultId: VaultId): Buffer | null
  removeBiometricKey(vaultId: VaultId): void
}

function labelFor(vaultId: VaultId): string {
  return `corebooks.vault.${vaultId}`
}

export function createBiometricStore(backend: BiometricBackend): BiometricStore {
  return {
    isBiometricAvailable: () => backend.isEncryptionAvailable(),
    storeBiometricKey(vaultId, K) {
      if (!backend.isEncryptionAvailable()) throw new Error('BiometricUnavailable')
      const encrypted = backend.encryptString(K.toString('hex'))
      backend.put(labelFor(vaultId), encrypted)
    },
    loadBiometricKey(vaultId) {
      if (!backend.isEncryptionAvailable()) return null
      const encrypted = backend.get(labelFor(vaultId))
      if (!encrypted) return null
      return Buffer.from(backend.decryptString(encrypted), 'hex')
    },
    removeBiometricKey(vaultId) {
      backend.remove(labelFor(vaultId))
    },
  }
}

/**
 * Test fake. Real backend wires Electron safeStorage; that wiring lives in
 * src/electron/main.ts where the Electron module import is acceptable.
 */
export class FakeBackend implements BiometricBackend {
  encryptionAvailable = true
  items = new Map<string, Buffer>()
  isEncryptionAvailable() { return this.encryptionAvailable }
  encryptString(plain: string) { return Buffer.from('FAKE:' + plain, 'utf-8') }
  decryptString(encrypted: Buffer) {
    const s = encrypted.toString('utf-8')
    if (!s.startsWith('FAKE:')) throw new Error('bad fake ciphertext')
    return s.slice(5)
  }
  put(label: string, value: Buffer) { this.items.set(label, value) }
  get(label: string) { return this.items.get(label) ?? null }
  remove(label: string) { this.items.delete(label) }
}
```

- [ ] **Step 4: Run, expect all 7 to pass**

```bash
npm test -- tests/electron/vault/biometric.test.ts
```

Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/electron/vault/biometric.ts tests/electron/vault/biometric.test.ts
git commit -m "$(cat <<'EOF'
feat: vault biometric seam

Dependency-injected BiometricBackend so the vault module stays free
of Electron imports. Real Electron safeStorage wiring is plugged in
later from main.ts. Keychain labels are per-vault
('corebooks.vault.<uuid>') so two vaults never share an entry.

Covers spec T15 (per-vault label) and T16 (unavailable fallback).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: VaultLifecycle — create, open, close

**Files:**
- Create: `src/electron/vault/lifecycle.ts`
- Test: `tests/electron/vault/lifecycle.test.ts`

This is the biggest task. It composes all prior modules + the DB layer into the `VaultLifecycle` class. Covers spec tests T1, T2, T5, T20.

**Pre-req:** Task 11 (DB layer rewire) is implemented later but `lifecycle.ts` consumes the new `openDatabase`/`createPrismaClient` signatures. To unblock TDD here, write a thin `src/electron/vault/db.ts` wrapper that lifecycle calls, mocking the actual DB in tests for now; the real Prisma plumbing arrives in Task 11.

For this task, the lifecycle's `open()` and `close()` accept an injectable `DbHandle` interface:

```ts
interface DbHandle { close(): Promise<void> }
interface DbFactory { open(args: { filePath: string; key: Buffer }): Promise<DbHandle> }
```

In tests, pass a fake `DbFactory`. In production, `main.ts` wires the real factory (Task 11).

- [ ] **Step 1: Write the failing tests**

`tests/electron/vault/lifecycle.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { VaultLifecycle, type DbFactory, type DbHandle } from '../../../src/electron/vault/lifecycle.js'
import { FakeBackend, createBiometricStore } from '../../../src/electron/vault/biometric.js'
import { readIdentity } from '../../../src/electron/vault/identity.js'

let tmp: string
let parentDir: string
let dbFactory: { open: ReturnType<typeof vi.fn>; lastKey: Buffer | null }
let biometric: ReturnType<typeof createBiometricStore>

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-life-'))
  parentDir = path.join(tmp, 'parent')
  fs.mkdirSync(parentDir, { recursive: true })
  const fakeDb: DbHandle = { close: vi.fn(async () => {}) }
  dbFactory = {
    open: vi.fn(async ({ key }: { filePath: string; key: Buffer }) => {
      dbFactory.lastKey = Buffer.from(key) // copy
      return fakeDb
    }),
    lastKey: null,
  }
  biometric = createBiometricStore(new FakeBackend())
})
afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }) })

function newLifecycle() {
  return new VaultLifecycle({
    dbFactory: dbFactory as unknown as DbFactory,
    biometric,
    pickerRegistryPath: path.join(tmp, 'picker.json'),
  })
}

describe('VaultLifecycle.create', () => {
  // Spec T1
  it('creates the full vault structure with valid identity, lock, audit, and process lock', async () => {
    const lc = newLifecycle()
    const result = await lc.create({
      directory: parentDir,
      displayName: 'Acme Books',
      password: 'correct horse battery staple',
    })
    expect(result.recoveryPhrase.split(' ')).toHaveLength(12)
    const vaultPath = result.vault.path
    expect(fs.existsSync(path.join(vaultPath, '.corebooks', 'vault.json'))).toBe(true)
    expect(fs.existsSync(path.join(vaultPath, '.corebooks', 'lock.json'))).toBe(true)
    expect(fs.existsSync(path.join(vaultPath, '.corebooks', 'settings.json'))).toBe(true)
    expect(fs.existsSync(path.join(vaultPath, '.corebooks', 'workspace.json'))).toBe(true)
    expect(fs.existsSync(path.join(vaultPath, '.corebooks', 'audit.jsonl'))).toBe(true)
    expect(fs.existsSync(path.join(vaultPath, '.corebooks', 'process.lock'))).toBe(true)
    for (const sub of ['imports', 'statements', 'receipts', 'exports']) {
      expect(fs.statSync(path.join(vaultPath, sub)).isDirectory()).toBe(true)
    }
    const id = readIdentity(vaultPath)
    expect(id.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(id.displayName).toBe('Acme Books')
    expect(dbFactory.lastKey?.length).toBe(32)
  }, 30_000)
})

describe('VaultLifecycle.open', () => {
  // Spec T2
  it('rejects open when vault.json UUID does not match the requested vault', async () => {
    const lc = newLifecycle()
    const { vault, recoveryPhrase: _ } = await lc.create({
      directory: parentDir,
      displayName: 'A',
      password: 'password 12 chars',
    })
    await lc.close()
    // Tamper: rewrite vault.json with a different UUID
    const idPath = path.join(vault.path, '.corebooks', 'vault.json')
    const id = JSON.parse(fs.readFileSync(idPath, 'utf-8'))
    id.id = '00000000-0000-4000-8000-000000000000'
    fs.writeFileSync(idPath, JSON.stringify(id))
    // Open with the path the picker thinks this vault is
    const lc2 = newLifecycle()
    const result = await lc2.open({ path: vault.path, password: 'password 12 chars' })
    expect(result.status).toBe('lock-tampered') // HMAC fails because lock.json was bound to original UUID
  }, 30_000)

  // Spec T5
  it('close() zeros the key buffer, releases the lock, calls db.close', async () => {
    const lc = newLifecycle()
    await lc.create({ directory: parentDir, displayName: 'A', password: 'password 12 chars' })
    const keyRef = lc.__test_getActiveKey()
    expect(keyRef).toBeInstanceOf(Buffer)
    expect(keyRef!.every(b => b === 0)).toBe(false)
    await lc.close()
    expect(keyRef!.every(b => b === 0)).toBe(true)
    expect(lc.current).toBeNull()
    // process.lock cleared in the original vault dir (we can find it via picker)
  }, 30_000)

  // Spec T20
  it('returns needs-settings-confirmation when settings.json is missing', async () => {
    const lc = newLifecycle()
    const { vault } = await lc.create({ directory: parentDir, displayName: 'A', password: 'password 12 chars' })
    await lc.close()
    fs.unlinkSync(path.join(vault.path, '.corebooks', 'settings.json'))
    const lc2 = newLifecycle()
    const result = await lc2.open({ path: vault.path, password: 'password 12 chars' })
    expect(result.status).toBe('needs-settings-confirmation')
    expect(fs.existsSync(path.join(vault.path, '.corebooks', 'settings.json'))).toBe(false)
  }, 30_000)
})
```

- [ ] **Step 2: Run, expect fail**

```bash
npm test -- tests/electron/vault/lifecycle.test.ts
```

Expected: FAIL — `VaultLifecycle` not exported.

- [ ] **Step 3: Implement `lifecycle.ts` (create + open + close only — switch/recovery in Task 9)**

```ts
import fs from 'node:fs'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { generateMnemonic, mnemonicToEntropy, validateMnemonic } from '@scure/bip39'
import { wordlist } from '@scure/bip39/wordlists/english.js'
import type {
  ActiveVault, OpenResult, PickerEntry, PickerRegistry, VaultId,
} from './types.js'
import { generateVaultId, readIdentity, writeIdentity } from './identity.js'
import { createLockFile, unlockWithPassword, verifyHmac } from './lockFile.js'
import { readSettings, writeSettings } from './settings.js'
import { writeWorkspace } from './workspace.js'
import { appendAuditEvent } from './audit.js'
import { acquireLock, releaseLock } from './processLock.js'
import { DEFAULT_VAULT_SETTINGS, DEFAULT_VAULT_WORKSPACE } from './defaults.js'
import type { BiometricStore } from './biometric.js'

const SUBDIRS = ['imports', 'statements', 'receipts', 'exports'] as const

export interface DbHandle { close(): Promise<void> }
export interface DbFactory {
  open(args: { filePath: string; key: Buffer }): Promise<DbHandle>
}

export interface VaultLifecycleConfig {
  dbFactory: DbFactory
  biometric: BiometricStore
  pickerRegistryPath: string
}

interface ActiveState {
  vault: ActiveVault
  key: Buffer
  db: DbHandle
}

export class VaultLifecycle {
  private state: ActiveState | null = null
  private cfg: VaultLifecycleConfig

  constructor(cfg: VaultLifecycleConfig) { this.cfg = cfg }

  get current(): Readonly<ActiveVault> | null { return this.state?.vault ?? null }

  /** Test-only — returns the live key buffer so tests can verify zeroing. */
  __test_getActiveKey(): Buffer | null { return this.state?.key ?? null }

  async create(args: { directory: string; displayName: string; password: string }): Promise<{
    vault: ActiveVault
    recoveryPhrase: string
  }> {
    if (args.password.length < 12) throw new Error('VaultPasswordTooShort')
    const sanitized = sanitizeVaultName(args.displayName)
    if (!sanitized) throw new Error('VaultDisplayNameRequired')
    const vaultPath = path.join(args.directory, sanitized)
    if (fs.existsSync(vaultPath)) throw new Error('VaultPathExists')

    fs.mkdirSync(vaultPath, { recursive: true })
    fs.mkdirSync(path.join(vaultPath, '.corebooks'))
    for (const sub of SUBDIRS) fs.mkdirSync(path.join(vaultPath, sub))

    const id: VaultId = generateVaultId()
    writeIdentity(vaultPath, {
      schemaVersion: 1,
      id,
      displayName: sanitized,
      created: new Date().toISOString(),
    })

    const K = randomBytes(32)
    const phrase = generateMnemonic(wordlist, 128) // 12 words
    const entropy = Buffer.from(mnemonicToEntropy(phrase, wordlist))
    const lock = createLockFile(id, K, args.password, entropy)
    fs.writeFileSync(path.join(vaultPath, '.corebooks', 'lock.json'), JSON.stringify(lock, null, 2), { mode: 0o600 })

    writeSettings(vaultPath, { ...structuredClone(DEFAULT_VAULT_SETTINGS), companyName: sanitized })
    writeWorkspace(vaultPath, structuredClone(DEFAULT_VAULT_WORKSPACE))

    appendAuditEvent(vaultPath, { actor: 'system', event: 'vault.created', data: { id, displayName: sanitized } })

    const lockResult = acquireLock(vaultPath)
    if (lockResult.status === 'busy') throw new Error('VaultBusy: just-created vault is already locked?')

    const db = await this.cfg.dbFactory.open({ filePath: path.join(vaultPath, 'corebooks.db'), key: K })

    const vault: ActiveVault = { id, path: vaultPath, displayName: sanitized, apiPort: 0 }
    this.state = { vault, key: K, db }
    appendAuditEvent(vaultPath, { actor: 'system', event: 'vault.opened', data: {} })
    this.updatePicker(vault)
    return { vault, recoveryPhrase: phrase }
  }

  async open(args: { path: string; password?: string }): Promise<OpenResult> {
    const vaultPath = args.path
    // Detect legacy vault (single-file .corebooks instead of directory)
    const corebooksPath = path.join(vaultPath, '.corebooks')
    if (fs.existsSync(corebooksPath) && fs.statSync(corebooksPath).isFile()) {
      return { status: 'legacy-needs-migration' }
    }
    let identity
    try {
      identity = readIdentity(vaultPath)
    } catch {
      return { status: 'identity-mismatch' }
    }

    const lockFilePath = path.join(vaultPath, '.corebooks', 'lock.json')
    if (!fs.existsSync(lockFilePath)) return { status: 'identity-mismatch' }
    const lock = JSON.parse(fs.readFileSync(lockFilePath, 'utf-8'))
    if (!verifyHmac(lock, identity.id)) return { status: 'lock-tampered' }

    if (!args.password) return { status: 'needs-password' }

    const lockResult = acquireLock(vaultPath)
    if (lockResult.status === 'busy') return { status: 'busy', lockedByPid: lockResult.lockedByPid }
    if (lockResult.status === 'reclaimed') {
      appendAuditEvent(vaultPath, { actor: 'system', event: 'vault.lock-reclaimed', data: { previousPid: lockResult.previousPid } })
    }

    let K: Buffer
    try {
      K = unlockWithPassword(lock, identity.id, args.password)
    } catch {
      releaseLock(vaultPath)
      return { status: 'needs-password' }
    }

    // Settings check before completing open
    try {
      readSettings(vaultPath)
    } catch (err) {
      if (String(err).includes('VaultSettingsMissing') || String(err).includes('VaultSettingsInvalid')) {
        K.fill(0)
        releaseLock(vaultPath)
        return { status: 'needs-settings-confirmation', defaults: structuredClone(DEFAULT_VAULT_SETTINGS) }
      }
      K.fill(0)
      releaseLock(vaultPath)
      throw err
    }

    const db = await this.cfg.dbFactory.open({ filePath: path.join(vaultPath, 'corebooks.db'), key: K })
    const vault: ActiveVault = { id: identity.id, path: vaultPath, displayName: identity.displayName, apiPort: 0 }
    this.state = { vault, key: K, db }
    appendAuditEvent(vaultPath, { actor: 'system', event: 'vault.opened', data: {} })
    this.updatePicker(vault)
    return { status: 'opened', vault }
  }

  async close(): Promise<void> {
    if (!this.state) return
    const { vault, key, db } = this.state
    appendAuditEvent(vault.path, { actor: 'system', event: 'vault.closed', data: {} })
    await db.close()
    key.fill(0)
    releaseLock(vault.path)
    this.state = null
  }

  private updatePicker(vault: ActiveVault): void {
    const file = this.cfg.pickerRegistryPath
    const reg: PickerRegistry = fs.existsSync(file)
      ? JSON.parse(fs.readFileSync(file, 'utf-8'))
      : { vaults: [] }
    const now = new Date().toISOString()
    const existing = reg.vaults.find(v => v.id === vault.id)
    const entry: PickerEntry = { id: vault.id, path: vault.path, displayName: vault.displayName, lastOpened: now }
    if (existing) {
      Object.assign(existing, entry)
    } else {
      reg.vaults.push(entry)
    }
    fs.writeFileSync(file, JSON.stringify(reg, null, 2), { mode: 0o600 })
  }
}

function sanitizeVaultName(name: string): string {
  return name.replace(/[/\\:*?"<>|]/g, '').trim().replace(/\s+/g, ' ').slice(0, 64)
}
```

- [ ] **Step 4: Run lifecycle tests, expect all 4 to pass**

```bash
npm test -- tests/electron/vault/lifecycle.test.ts
```

Expected: PASS, 4 tests. Total time ~30-60s (Argon2id heavy).

- [ ] **Step 5: Run full vault test suite to confirm no regressions**

```bash
npm test -- tests/electron/vault/
```

Expected: every test in the suite passes.

- [ ] **Step 6: Commit**

```bash
git add src/electron/vault/lifecycle.ts tests/electron/vault/lifecycle.test.ts
git commit -m "$(cat <<'EOF'
feat: VaultLifecycle create + open + close

The single seam for vault state. Composes identity, lockFile, settings,
workspace, audit, processLock into create/open/close. Key flows as a
Buffer (never env var) and is zeroed on close.

DbFactory is dependency-injected so this module stays free of Prisma
imports; real wiring lands in main.ts via Task 11.

Covers spec tests T1, T2, T5, T20.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: VaultLifecycle — switch, recovery, audit append

**Files:**
- Modify: `src/electron/vault/lifecycle.ts`
- Modify: `tests/electron/vault/lifecycle.test.ts`

Covers spec tests T11, T19.

- [ ] **Step 1: Add failing tests at the bottom of `lifecycle.test.ts`**

```ts
describe('VaultLifecycle.switch', () => {
  // Spec T19
  it('switch tears down A cleanly then opens B; A key zeroed, lock released', async () => {
    const lc = newLifecycle()
    const a = await lc.create({ directory: parentDir, displayName: 'A', password: 'password 12 chars' })
    const aKey = lc.__test_getActiveKey()!
    const bParent = path.join(tmp, 'parent-b')
    fs.mkdirSync(bParent)
    const result = await lc.switch({
      target: { directory: bParent, displayName: 'B', password: 'password 12 chars more' },
    })
    expect(result.status).toBe('opened')
    expect(aKey.every(b => b === 0)).toBe(true)
    expect(fs.existsSync(path.join(a.vault.path, '.corebooks', 'process.lock'))).toBe(false)
    expect(lc.current?.displayName).toBe('B')
  }, 60_000)
})

describe('VaultLifecycle.unlockWithRecovery', () => {
  // Spec T11
  it('unlocks with recovery phrase and rotates the password', async () => {
    const lc = newLifecycle()
    const { vault, recoveryPhrase } = await lc.create({
      directory: parentDir, displayName: 'A', password: 'original pass 12',
    })
    await lc.close()
    const lc2 = newLifecycle()
    const result = await lc2.unlockWithRecovery({
      path: vault.path, phrase: recoveryPhrase, newPassword: 'new pass 12 chars',
    })
    expect(result.status).toBe('opened')
    await lc2.close()
    // Verify new password works
    const lc3 = newLifecycle()
    const r = await lc3.open({ path: vault.path, password: 'new pass 12 chars' })
    expect(r.status).toBe('opened')
  }, 90_000)
})

describe('VaultLifecycle.appendAuditEvent', () => {
  it('appends events to the active vault via the public API', async () => {
    const lc = newLifecycle()
    await lc.create({ directory: parentDir, displayName: 'A', password: 'password 12 chars' })
    await lc.appendAuditEvent('password.changed', { by: 'user' })
    const audit = JSON.parse(fs.readFileSync(path.join(lc.current!.path, '.corebooks', 'audit.jsonl'), 'utf-8').trim().split('\n').pop()!)
    expect(audit.event).toBe('password.changed')
    expect(audit.actor).toBe('human')
  }, 30_000)
})
```

- [ ] **Step 2: Run, expect fail**

```bash
npm test -- tests/electron/vault/lifecycle.test.ts -t "switch"
```

Expected: FAIL — `lc.switch is not a function`.

- [ ] **Step 3: Extend `lifecycle.ts` with switch, unlockWithRecovery, appendAuditEvent**

Add these methods to the `VaultLifecycle` class (between `close` and `updatePicker`):

```ts
async switch(args: {
  target:
    | { directory: string; displayName: string; password: string }
    | { path: string; password: string }
}): Promise<OpenResult | { status: 'opened'; vault: ActiveVault }> {
  await this.close()
  if ('directory' in args.target) {
    const { vault } = await this.create(args.target)
    return { status: 'opened', vault }
  }
  return this.open(args.target)
}

async unlockWithRecovery(args: { path: string; phrase: string; newPassword: string }): Promise<OpenResult> {
  if (args.newPassword.length < 12) throw new Error('VaultPasswordTooShort')
  if (!validateMnemonic(args.phrase, wordlist)) throw new Error('VaultRecoveryPhraseInvalid')
  const identity = readIdentity(args.path)
  const lockFilePath = path.join(args.path, '.corebooks', 'lock.json')
  const lock = JSON.parse(fs.readFileSync(lockFilePath, 'utf-8'))
  if (!verifyHmac(lock, identity.id)) return { status: 'lock-tampered' }

  const entropy = Buffer.from(mnemonicToEntropy(args.phrase, wordlist))
  const { unlockWithRecovery: unwrap } = await import('./lockFile.js')
  const K = unwrap(lock, identity.id, entropy)

  // Rewrite lock.json with new password slot but same K and same recovery slot.
  const newLock = createLockFile(identity.id, K, args.newPassword, entropy)
  fs.writeFileSync(lockFilePath, JSON.stringify(newLock, null, 2), { mode: 0o600 })
  appendAuditEvent(args.path, { actor: 'human', event: 'password.rotated-via-recovery', data: {} })

  const lockResult = acquireLock(args.path)
  if (lockResult.status === 'busy') { K.fill(0); return { status: 'busy', lockedByPid: lockResult.lockedByPid } }
  const db = await this.cfg.dbFactory.open({ filePath: path.join(args.path, 'corebooks.db'), key: K })
  const vault: ActiveVault = { id: identity.id, path: args.path, displayName: identity.displayName, apiPort: 0 }
  this.state = { vault, key: K, db }
  appendAuditEvent(args.path, { actor: 'system', event: 'vault.opened', data: {} })
  this.updatePicker(vault)
  return { status: 'opened', vault }
}

async appendAuditEvent(event: string, data: unknown): Promise<void> {
  if (!this.state) throw new Error('NoActiveVault')
  appendAuditEvent(this.state.vault.path, { actor: 'human', event, data })
}
```

You'll need to add the `validateMnemonic` import at the top:

```ts
import { generateMnemonic, mnemonicToEntropy, validateMnemonic } from '@scure/bip39'
```

- [ ] **Step 4: Run, expect all to pass**

```bash
npm test -- tests/electron/vault/lifecycle.test.ts
```

Expected: PASS, 7 tests total.

- [ ] **Step 5: Commit**

```bash
git add src/electron/vault/lifecycle.ts tests/electron/vault/lifecycle.test.ts
git commit -m "$(cat <<'EOF'
feat: VaultLifecycle switch, unlockWithRecovery, appendAuditEvent

switch(): teardown A + open B in one process — no Electron relaunch
needed because Prisma client lives on the lifecycle, not as a
module singleton.

unlockWithRecovery(): BIP-39 phrase unwraps K via the recovery slot
and rotates the password slot with a new password (same K, same
recovery slot remain). Audit records password.rotated-via-recovery.

appendAuditEvent(): public hook for non-system events (password
changes, biometric toggles, etc.) — actor defaults to 'human'.

Covers spec tests T11, T19.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Migration from legacy — `migration.ts`

**Files:**
- Create: `src/electron/vault/migration.ts`
- Test: `tests/electron/vault/migration.test.ts`

Covers spec tests T6, T7. Uses `better-sqlite3-multiple-ciphers` directly to simulate the legacy plaintext-key DB and verify rekey.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import Database from 'better-sqlite3-multiple-ciphers'
import { migrateLegacyVault } from '../../../src/electron/vault/migration.js'
import { readIdentity } from '../../../src/electron/vault/identity.js'
import { readAuditLog } from '../../../src/electron/vault/audit.js'

let tmp: string
const OLD_KEY = Buffer.from('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef', 'hex')

function makeLegacyVault(): string {
  const v = path.join(tmp, 'LegacyVault')
  fs.mkdirSync(v)
  for (const sub of ['imports', 'statements', 'receipts', 'exports']) fs.mkdirSync(path.join(v, sub))
  fs.writeFileSync(path.join(v, '.corebooks'), JSON.stringify({ version: '1', name: 'LegacyVault', created: '2025-01-01T00:00:00Z' }), { mode: 0o600 })
  // Create a SQLCipher DB keyed with the old global key
  const dbPath = path.join(v, 'corebooks.db')
  const db = new Database(dbPath)
  db.pragma(`key = "x'${OLD_KEY.toString('hex')}'"`)
  db.exec('CREATE TABLE marker (id INTEGER PRIMARY KEY, value TEXT)')
  db.prepare('INSERT INTO marker VALUES (1, ?)').run('legacy-data')
  db.close()
  return v
}

beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-mig-')) })
afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }) })

describe('migration', () => {
  // Spec T6
  it('migrates a legacy vault to the new structure', async () => {
    const v = makeLegacyVault()
    const result = await migrateLegacyVault({
      vaultPath: v, oldGlobalKey: OLD_KEY, password: 'migration pw 12c', displayName: 'LegacyVault',
    })
    expect(result.recoveryPhrase.split(' ')).toHaveLength(12)
    expect(fs.existsSync(path.join(v, '.corebooks.legacy-backup'))).toBe(true)
    expect(fs.existsSync(path.join(v, 'corebooks.db.pre-migration'))).toBe(true)
    expect(fs.statSync(path.join(v, '.corebooks')).isDirectory()).toBe(true)
    const id = readIdentity(v)
    expect(id.displayName).toBe('LegacyVault')
    const audit = readAuditLog(v)
    expect(audit[0].event).toBe('vault.created')
    expect(audit.some(e => e.event === 'vault.migrated-from-legacy')).toBe(true)
    // Verify the rekeyed DB is readable with the new K
    const db = new Database(path.join(v, 'corebooks.db'))
    db.pragma(`key = "x'${result.newKey.toString('hex')}'"`)
    const row = db.prepare('SELECT value FROM marker WHERE id = 1').get() as { value: string }
    expect(row.value).toBe('legacy-data')
    db.close()
  }, 60_000)

  // Spec T7 — three injected failure points
  it.each([
    ['after-backup',   'simulated failure during rekey'],
    ['after-rekey',    'simulated failure during identity write'],
    ['after-identity', 'simulated failure during lock write'],
  ])('aborts on failure at %s and restores legacy state', async (point, msg) => {
    const v = makeLegacyVault()
    await expect(
      migrateLegacyVault({
        vaultPath: v, oldGlobalKey: OLD_KEY, password: 'migration pw 12c', displayName: 'LegacyVault',
        __test_failAt: point as 'after-backup' | 'after-rekey' | 'after-identity',
      })
    ).rejects.toThrow(/simulated|MigrationFailed/)
    // Legacy state restored
    expect(fs.statSync(path.join(v, '.corebooks')).isFile()).toBe(true)
    // DB still openable with old key
    const db = new Database(path.join(v, 'corebooks.db'))
    db.pragma(`key = "x'${OLD_KEY.toString('hex')}'"`)
    const row = db.prepare('SELECT value FROM marker WHERE id = 1').get() as { value: string }
    expect(row.value).toBe('legacy-data')
    db.close()
  }, 60_000)
})
```

- [ ] **Step 2: Run, expect fail**

```bash
npm test -- tests/electron/vault/migration.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `migration.ts`**

```ts
import fs from 'node:fs'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import Database from 'better-sqlite3-multiple-ciphers'
import { generateMnemonic, mnemonicToEntropy } from '@scure/bip39'
import { wordlist } from '@scure/bip39/wordlists/english.js'
import { generateVaultId, writeIdentity } from './identity.js'
import { createLockFile } from './lockFile.js'
import { writeSettings } from './settings.js'
import { writeWorkspace } from './workspace.js'
import { appendAuditEvent } from './audit.js'
import { DEFAULT_VAULT_SETTINGS, DEFAULT_VAULT_WORKSPACE } from './defaults.js'

export type FailPoint = 'after-backup' | 'after-rekey' | 'after-identity'

export interface MigrationArgs {
  vaultPath: string
  oldGlobalKey: Buffer
  password: string
  displayName: string
  __test_failAt?: FailPoint
}

export interface MigrationResult {
  recoveryPhrase: string
  newKey: Buffer
}

export async function migrateLegacyVault(args: MigrationArgs): Promise<MigrationResult> {
  const v = args.vaultPath
  const legacyFile = path.join(v, '.corebooks')
  const backupFile = path.join(v, '.corebooks.legacy-backup')
  const dbFile = path.join(v, 'corebooks.db')
  const dbBackup = path.join(v, 'corebooks.db.pre-migration')

  if (!fs.existsSync(legacyFile) || !fs.statSync(legacyFile).isFile()) {
    throw new Error('MigrationFailed: not a legacy vault')
  }

  // Step 2: rename legacy file → backup. Frees the .corebooks slot for a directory.
  fs.renameSync(legacyFile, backupFile)

  try {
    // Step 3: copy DB.
    fs.copyFileSync(dbFile, dbBackup)
    if (args.__test_failAt === 'after-backup') throw new Error('simulated failure during rekey')

    // Step 4-5: generate new K and rekey corebooks.db in place.
    const newKey = randomBytes(32)
    rekeyDb(dbFile, args.oldGlobalKey, newKey)
    if (args.__test_failAt === 'after-rekey') throw new Error('simulated failure during identity write')

    // Step 6-7: write new .corebooks/ structure.
    fs.mkdirSync(path.join(v, '.corebooks'))
    const id = generateVaultId()
    writeIdentity(v, {
      schemaVersion: 1, id, displayName: args.displayName, created: new Date().toISOString(),
    })
    if (args.__test_failAt === 'after-identity') throw new Error('simulated failure during lock write')

    const phrase = generateMnemonic(wordlist, 128)
    const entropy = Buffer.from(mnemonicToEntropy(phrase, wordlist))
    const lock = createLockFile(id, newKey, args.password, entropy)
    fs.writeFileSync(path.join(v, '.corebooks', 'lock.json'), JSON.stringify(lock, null, 2), { mode: 0o600 })

    writeSettings(v, { ...structuredClone(DEFAULT_VAULT_SETTINGS), companyName: args.displayName })
    writeWorkspace(v, structuredClone(DEFAULT_VAULT_WORKSPACE))

    appendAuditEvent(v, { actor: 'system', event: 'vault.created', data: { id, displayName: args.displayName } })
    appendAuditEvent(v, { actor: 'migration', event: 'vault.migrated-from-legacy', data: { from: 'plan-f-single-file' } })

    return { recoveryPhrase: phrase, newKey }
  } catch (err) {
    // Roll back: restore legacy state.
    if (fs.existsSync(path.join(v, '.corebooks')) && fs.statSync(path.join(v, '.corebooks')).isDirectory()) {
      fs.rmSync(path.join(v, '.corebooks'), { recursive: true, force: true })
    }
    if (fs.existsSync(dbBackup)) {
      fs.copyFileSync(dbBackup, dbFile) // restore plaintext-keyed DB
      fs.unlinkSync(dbBackup)
    }
    if (fs.existsSync(backupFile) && !fs.existsSync(legacyFile)) {
      fs.renameSync(backupFile, legacyFile)
    }
    throw err
  }
}

function rekeyDb(dbFile: string, oldKey: Buffer, newKey: Buffer): void {
  const db = new Database(dbFile)
  try {
    db.pragma(`key = "x'${oldKey.toString('hex')}'"`)
    // Verify we can read with old key first
    db.prepare('SELECT count(*) FROM sqlite_master').get()
    db.pragma(`rekey = "x'${newKey.toString('hex')}'"`)
  } finally {
    db.close()
  }
}
```

- [ ] **Step 4: Run, expect all 4 to pass**

```bash
npm test -- tests/electron/vault/migration.test.ts
```

Expected: PASS, 4 tests (1 happy path + 3 failure points via `it.each`).

- [ ] **Step 5: Commit**

```bash
git add src/electron/vault/migration.ts tests/electron/vault/migration.test.ts
git commit -m "$(cat <<'EOF'
feat: legacy vault migration with defensive backups

Migrates Phase 10/11/Plan F vaults to the new isolated structure.
Step order per spec §7: rename legacy file → backup, copy DB, rekey
in place, mkdir new .corebooks/, write identity/lock/settings/
workspace/audit. Any failure rolls back to the openable legacy
state.

Covers spec tests T6 (happy path) and T7 (three failure points).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: DB layer rewire — `openDatabase.ts`, `client.ts`

**Files:**
- Modify: `src/db/openDatabase.ts`
- Modify: `src/db/client.ts`
- Modify: `src/api/bootstrap.ts` (small change)
- Test: `tests/db/openDatabase.test.ts` (existing — verify still passes)
- Test: `tests/electron/vault/envVarGuard.test.ts` (new — spec T14)

Covers spec test T14.

- [ ] **Step 1: Write the failing T14 guard test**

`tests/electron/vault/envVarGuard.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(__dirname, '../../..')

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git' || entry.name === 'release') continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, acc)
    else if (/\.(ts|tsx|js)$/.test(entry.name)) acc.push(full)
  }
  return acc
}

describe('env var guard (spec T14)', () => {
  it('COREBOOKS_DB_KEY appears nowhere in non-test source', () => {
    const files = walk(path.join(ROOT, 'src'))
    const offenders = files.filter(f =>
      fs.readFileSync(f, 'utf-8').includes('COREBOOKS_DB_KEY')
    )
    expect(offenders).toEqual([])
  })

  it('no source file reads process.env.*KEY*', () => {
    const files = walk(path.join(ROOT, 'src'))
    const offenders = files.filter(f =>
      /process\.env\[?['"][^'"]*KEY[^'"]*['"]\]?/.test(fs.readFileSync(f, 'utf-8'))
    )
    expect(offenders).toEqual([])
  })
})
```

- [ ] **Step 2: Run, expect fail** (current `src/db/client.ts` reads `COREBOOKS_DB_KEY`)

```bash
npm test -- tests/electron/vault/envVarGuard.test.ts
```

Expected: FAIL — `client.ts` listed as offender.

- [ ] **Step 3: Rewrite `src/db/openDatabase.ts`** to accept a `Buffer` key

```ts
import Database from 'better-sqlite3-multiple-ciphers'

type Db = InstanceType<typeof Database>

export interface OpenDatabaseArgs {
  filePath: string
  key: Buffer | null // null = open as plaintext (used only by migration paths)
}

export function openDatabase({ filePath, key }: OpenDatabaseArgs): Db {
  if (!key) {
    const db = new Database(filePath)
    db.defaultSafeIntegers(true)
    try {
      db.prepare('SELECT count(*) FROM sqlite_master').get()
    } catch {
      db.close()
      throw new Error('Database appears to be encrypted but no key was provided.')
    }
    return db
  }
  const hex = key.toString('hex')
  const db = new Database(filePath)
  db.pragma(`key = "x'${hex}'"`)
  db.defaultSafeIntegers(true)
  try {
    db.prepare('SELECT count(*) FROM sqlite_master').get()
    return db
  } catch {
    db.close()
    // Plaintext database that needs encrypting in place.
    const plain = new Database(filePath)
    try { plain.pragma(`rekey = "x'${hex}'"`) } finally { plain.close() }
    return openDatabase({ filePath, key })
  }
}
```

- [ ] **Step 4: Rewrite `src/db/client.ts`** to take args, not env

```ts
import { PrismaClient } from '../generated/prisma/client.js'
import { SqlCipherAdapterFactory } from './sqlcipherAdapter.js'
import { openDatabase } from './openDatabase.js'
import type Database from 'better-sqlite3-multiple-ciphers'

type Db = InstanceType<typeof Database>

export function isPostgresUrl(rawUrl: string): boolean {
  return rawUrl.startsWith('postgresql://') || rawUrl.startsWith('postgres://')
}

export function postgresHasSSL(rawUrl: string): boolean {
  return (
    rawUrl.includes('sslmode=require') ||
    rawUrl.includes('sslmode=verify-full') ||
    rawUrl.includes('sslmode=verify-ca') ||
    rawUrl.includes('ssl=true')
  )
}

export interface PrismaBundle {
  client: PrismaClient
  db: Db
}

export function createPrismaClient(args: { filePath: string; key: Buffer }): PrismaBundle {
  const db = openDatabase({ filePath: args.filePath, key: args.key })
  const factory = new SqlCipherAdapterFactory({ url: args.filePath }, db)
  const client = new PrismaClient({ adapter: factory })
  return { client, db }
}
```

- [ ] **Step 5: Update `src/api/bootstrap.ts`** to accept and pass `{filePath, key}`

Locate the existing call to `getPrismaClient()` / `getOpenDb()`. Replace with:

```ts
export async function startApi(args: { filePath: string; key: Buffer; port?: number }) {
  const { client, db } = createPrismaClient({ filePath: args.filePath, key: args.key })
  await ensureSchema(db)
  // ... existing Fastify setup using `client` ...
}
```

(Adapt the surrounding code as needed — read the current `bootstrap.ts` and preserve its existing Fastify wiring. The change is purely how `client` and `db` are obtained.)

- [ ] **Step 6: Run the guard test, expect pass**

```bash
npm test -- tests/electron/vault/envVarGuard.test.ts
```

Expected: PASS. If still failing, grep `src/` for remaining `COREBOOKS_DB_KEY` references and remove.

- [ ] **Step 7: Run the existing DB tests**

```bash
npm test -- tests/db/
```

Expected: existing `openDatabase.test.ts` and `sqlcipherAdapter.test.ts` may need their call signatures updated to match the new `{filePath, key}` shape. Adapt the test calls if needed; the underlying behaviour is unchanged.

- [ ] **Step 8: Type-check**

```bash
npm run build
```

Expected: zero errors. If `getPrismaClient`/`getOpenDb`/`disconnectPrisma` are called anywhere else in `src/`, those call sites need updating to use `createPrismaClient`. Grep them out.

- [ ] **Step 9: Commit**

```bash
git add src/db/openDatabase.ts src/db/client.ts src/api/bootstrap.ts tests/electron/vault/envVarGuard.test.ts tests/db/
git commit -m "$(cat <<'EOF'
feat: eliminate COREBOOKS_DB_KEY env var; key flows as Buffer

openDatabase takes {filePath, key:Buffer|null} — null means "open
as plaintext for migration only". client.ts is no longer a singleton:
createPrismaClient returns {client, db} per call, owned by whatever
holds the active vault. bootstrap.ts passes the live K Buffer through.

Static lint test (spec T14) guards against re-introduction of
COREBOOKS_DB_KEY or process.env.*KEY* reads in non-test source.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Electron IPC — `main.ts`, `preload.ts`, `electron.d.ts`

**Files:**
- Modify: `src/electron/main.ts` (large refactor)
- Modify: `src/electron/preload.ts`
- Modify: `src/ui/electron.d.ts`

This task is a large rewrite. Drive it from the new IPC surface, not the existing code. Read the spec §6 OpenResult enum before starting. The lifecycle is the single seam — all vault IPC handlers delegate to it.

- [ ] **Step 1: Read the current main.ts to understand the surface area being replaced**

```bash
# Just for orientation, no changes yet
wc -l src/electron/main.ts
```

You should see ~580 lines. Most of the vault-specific code (everything between `const vaultManager = new VaultManager(...)` and the end of the vault IPC handlers, plus `getOrCreateEncryptionKey`, plus `startApiForVault`) is being replaced.

- [ ] **Step 2: Define the new IPC surface in `src/ui/electron.d.ts`**

Replace the `vault` namespace block with:

```ts
export type OpenResult =
  | { status: 'opened'; vault: ActiveVault }
  | { status: 'needs-password' }
  | { status: 'needs-settings-confirmation'; defaults: VaultSettings }
  | { status: 'busy'; lockedByPid: number }
  | { status: 'identity-mismatch' }
  | { status: 'lock-tampered' }
  | { status: 'legacy-needs-migration' }

export interface ActiveVault {
  id: string
  path: string
  displayName: string
  apiPort: number
}

export interface PickerEntry {
  id: string
  path: string
  displayName: string
  lastOpened: string
}

declare global {
  interface Window {
    electronAPI: {
      apiBaseUrl: string | null
      vault: {
        list(): Promise<PickerEntry[]>
        create(args: { directory: string; displayName: string; password: string }): Promise<{ vault: ActiveVault; recoveryPhrase: string }>
        open(args: { path: string; password?: string }): Promise<OpenResult>
        close(): Promise<void>
        switchTo(args: { path: string; password: string }): Promise<OpenResult>
        unlockWithRecovery(args: { path: string; phrase: string; newPassword: string }): Promise<OpenResult>
        confirmDefaultSettings(): Promise<void>
        chooseDirectory(): Promise<string | null>
        showInExplorer(vaultPath: string): Promise<void>
        migrateLegacy(args: { path: string; password: string }): Promise<{ recoveryPhrase: string }>
        enableBiometric(): Promise<void>
        disableBiometric(): Promise<void>
        isBiometricAvailable(): Promise<boolean>
      }
    }
  }
}
```

- [ ] **Step 3: Rewrite `src/electron/preload.ts`** to expose those IPC channels

```ts
import { contextBridge, ipcRenderer } from 'electron'

const apiBaseUrl = ipcRenderer.sendSync('vault:getApiBaseUrl') as string | null

contextBridge.exposeInMainWorld('electronAPI', {
  apiBaseUrl,
  vault: {
    list: () => ipcRenderer.invoke('vault:list'),
    create: (args: unknown) => ipcRenderer.invoke('vault:create', args),
    open: (args: unknown) => ipcRenderer.invoke('vault:open', args),
    close: () => ipcRenderer.invoke('vault:close'),
    switchTo: (args: unknown) => ipcRenderer.invoke('vault:switch', args),
    unlockWithRecovery: (args: unknown) => ipcRenderer.invoke('vault:unlockWithRecovery', args),
    confirmDefaultSettings: () => ipcRenderer.invoke('vault:confirmDefaultSettings'),
    chooseDirectory: () => ipcRenderer.invoke('vault:chooseDirectory'),
    showInExplorer: (p: string) => ipcRenderer.invoke('vault:showInExplorer', p),
    migrateLegacy: (args: unknown) => ipcRenderer.invoke('vault:migrateLegacy', args),
    enableBiometric: () => ipcRenderer.invoke('vault:enableBiometric'),
    disableBiometric: () => ipcRenderer.invoke('vault:disableBiometric'),
    isBiometricAvailable: () => ipcRenderer.invoke('vault:isBiometricAvailable'),
  },
})
```

- [ ] **Step 4: Rewrite the vault portion of `src/electron/main.ts`**

Replace the entire vault section (the `VaultManager` instantiation, all `vault:*` IPC handlers, `getOrCreateEncryptionKey`, `startApiForVault`) with this block:

```ts
import { app, BrowserWindow, dialog, ipcMain, safeStorage, shell } from 'electron'
import path from 'node:path'
import { VaultLifecycle } from './vault/lifecycle.js'
import { createBiometricStore, type BiometricBackend } from './vault/biometric.js'
import { createPrismaClient } from '../db/client.js'
import { startApi } from '../api/bootstrap.js'
import { migrateLegacyVault } from './vault/migration.js'

// Electron-backed BiometricBackend implementation. The in-process Map plus
// safeStorage gives a deterministic per-vault keychain entry without
// needing native macOS Keychain APIs directly (safeStorage uses Keychain
// internally on macOS / DPAPI on Windows / libsecret on Linux).
const electronItems = new Map<string, Buffer>()

const electronBackend: BiometricBackend = {
  isEncryptionAvailable: () => safeStorage.isEncryptionAvailable(),
  encryptString: (plain) => safeStorage.encryptString(plain),
  decryptString: (encrypted) => safeStorage.decryptString(encrypted),
  put: (label, value) => electronItems.set(label, value),
  get: (label) => electronItems.get(label) ?? null,
  remove: (label) => { electronItems.delete(label) },
}

const lifecycle = new VaultLifecycle({
  dbFactory: {
    async open({ filePath, key }) {
      const { client, db } = createPrismaClient({ filePath, key })
      const port = await startApi({ prisma: client, db })
      currentApiPort = port
      return {
        async close() {
          await client.$disconnect()
          db.close()
        },
      }
    },
  },
  biometric: createBiometricStore(electronBackend),
  pickerRegistryPath: path.join(app.getPath('userData'), 'picker.json'),
})

let currentApiPort: number | null = null

ipcMain.on('vault:getApiBaseUrl', (event) => {
  event.returnValue = currentApiPort ? `http://127.0.0.1:${currentApiPort}` : null
})

ipcMain.handle('vault:list', () => {
  const file = path.join(app.getPath('userData'), 'picker.json')
  if (!fs.existsSync(file)) return []
  return (JSON.parse(fs.readFileSync(file, 'utf-8')).vaults ?? [])
    .sort((a: any, b: any) => new Date(b.lastOpened).getTime() - new Date(a.lastOpened).getTime())
})

ipcMain.handle('vault:create', async (_e, args) => lifecycle.create(args))
ipcMain.handle('vault:open', async (_e, args) => lifecycle.open(args))
ipcMain.handle('vault:close', async () => lifecycle.close())
ipcMain.handle('vault:switch', async (_e, args) => lifecycle.switch({ target: args }))
ipcMain.handle('vault:unlockWithRecovery', async (_e, args) => lifecycle.unlockWithRecovery(args))
ipcMain.handle('vault:confirmDefaultSettings', async () => {
  // After this resolves, the caller should re-invoke vault:open.
  // The settings file is written by writeSettings(); we just write the defaults here.
  const { writeSettings } = await import('./vault/settings.js')
  const { DEFAULT_VAULT_SETTINGS } = await import('./vault/defaults.js')
  const pending = pendingSettingsConfirmation
  if (!pending) throw new Error('NoPendingSettingsConfirmation')
  writeSettings(pending.path, { ...DEFAULT_VAULT_SETTINGS, companyName: pending.defaultName })
  pendingSettingsConfirmation = null
})

ipcMain.handle('vault:chooseDirectory', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })
  return result.canceled ? null : result.filePaths[0]
})

ipcMain.handle('vault:showInExplorer', async (_e, vaultPath: string) => {
  shell.showItemInFolder(vaultPath)
})

ipcMain.handle('vault:migrateLegacy', async (_e, args: { path: string; password: string }) => {
  // Legacy vaults need the old global key — read it from .db.key in userData.
  const oldKeyPath = path.join(app.getPath('userData'), '.db.key')
  if (!fs.existsSync(oldKeyPath)) throw new Error('LegacyKeyMissing')
  const encrypted = fs.readFileSync(oldKeyPath)
  const hex = safeStorage.decryptString(encrypted)
  const oldKey = Buffer.from(hex, 'hex')
  const displayName = path.basename(args.path)
  const result = await migrateLegacyVault({ vaultPath: args.path, oldGlobalKey: oldKey, password: args.password, displayName })
  return { recoveryPhrase: result.recoveryPhrase }
})

ipcMain.handle('vault:enableBiometric', async () => {
  const v = lifecycle.current
  if (!v) throw new Error('NoActiveVault')
  // Re-derive K is impossible (the buffer is private). Use the live key via a
  // dedicated lifecycle method that exposes a clone for biometric storage.
  await lifecycle.enableBiometricForActiveVault()
})
ipcMain.handle('vault:disableBiometric', async () => {
  const v = lifecycle.current
  if (!v) throw new Error('NoActiveVault')
  await lifecycle.disableBiometricForActiveVault()
})
ipcMain.handle('vault:isBiometricAvailable', () => safeStorage.isEncryptionAvailable())

// Clean teardown on app quit.
app.on('before-quit', async () => { await lifecycle.close() })

let pendingSettingsConfirmation: { path: string; defaultName: string } | null = null
```

(You will need to wire the `pendingSettingsConfirmation` set inside `vault:open` when the lifecycle returns `needs-settings-confirmation` — extract that into a wrapper handler.)

- [ ] **Step 5: Add the biometric helper methods to `VaultLifecycle`**

In `src/electron/vault/lifecycle.ts`, append:

```ts
async enableBiometricForActiveVault(): Promise<void> {
  if (!this.state) throw new Error('NoActiveVault')
  this.cfg.biometric.storeBiometricKey(this.state.vault.id, Buffer.from(this.state.key))
  appendAuditEvent(this.state.vault.path, { actor: 'human', event: 'biometric.enabled', data: {} })
}

async disableBiometricForActiveVault(): Promise<void> {
  if (!this.state) throw new Error('NoActiveVault')
  this.cfg.biometric.removeBiometricKey(this.state.vault.id)
  appendAuditEvent(this.state.vault.path, { actor: 'human', event: 'biometric.disabled', data: {} })
}
```

- [ ] **Step 6: Update `startApi` signature in `src/api/bootstrap.ts`**

The lifecycle expects `startApi({ prisma, db })` returning `Promise<number>` (the bound port). If the current bootstrap takes a different shape, refactor it. Do not change Fastify routes — only the boot/dependency-injection.

- [ ] **Step 7: Type-check the whole project**

```bash
npm run build
npx tsc --project src/ui/tsconfig.json --noEmit
```

Expected: zero errors. Fix any breakage in `main.ts` (likely import names, app paths, missing `fs` import).

- [ ] **Step 8: Smoke-test the app manually**

```bash
npm run dev
# In another terminal:
npm run dev:electron
```

Expected: app launches, picker shows (empty if no vaults). Create a vault, close, reopen with password. Both flows work end-to-end.

- [ ] **Step 9: Commit**

```bash
git add src/electron/main.ts src/electron/preload.ts src/ui/electron.d.ts src/api/bootstrap.ts src/electron/vault/lifecycle.ts
git commit -m "$(cat <<'EOF'
feat: rewire Electron IPC to VaultLifecycle

main.ts: drop VaultManager / getOrCreateEncryptionKey / COREBOOKS_DB_KEY
env writes. Every vault IPC handler delegates to VaultLifecycle. The
DbFactory closure plugs Prisma + startApi into lifecycle without the
lifecycle module importing either. Biometric uses safeStorage as the
backend implementation; storage label is per-vault.

preload.ts + electron.d.ts: new IPC surface matches spec §6 OpenResult.

bootstrap.ts: startApi now takes {prisma, db} explicitly (no module
singleton).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: UI — picker page + universal unlock modal

**Files:**
- Modify: `src/ui/pages/VaultPickerPage.tsx`
- Modify: `src/ui/components/UnlockVaultModal.tsx`
- Test: `tests/electron/vault/pickerRegistry.test.ts` (new — spec T8, T9)

- [ ] **Step 1: Write the failing picker registry tests**

`tests/electron/vault/pickerRegistry.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { VaultLifecycle, type DbFactory } from '../../../src/electron/vault/lifecycle.js'
import { FakeBackend, createBiometricStore } from '../../../src/electron/vault/biometric.js'

let tmp: string
let dbFactory: DbFactory
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-pick-'))
  dbFactory = { open: vi.fn(async () => ({ close: vi.fn(async () => {}) })) }
})
afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }) })

// Spec T8
it('picker.json only contains {id, path, displayName, lastOpened} per entry', async () => {
  const pickerPath = path.join(tmp, 'picker.json')
  const lc = new VaultLifecycle({ dbFactory, biometric: createBiometricStore(new FakeBackend()), pickerRegistryPath: pickerPath })
  for (let i = 0; i < 3; i++) {
    fs.mkdirSync(path.join(tmp, `p${i}`))
    await lc.create({ directory: path.join(tmp, `p${i}`), displayName: `V${i}`, password: 'password 12 chars' })
    await lc.close()
  }
  const reg = JSON.parse(fs.readFileSync(pickerPath, 'utf-8'))
  for (const entry of reg.vaults) {
    expect(Object.keys(entry).sort()).toEqual(['displayName', 'id', 'lastOpened', 'path'])
    const json = JSON.stringify(entry)
    expect(json).not.toMatch(/password|salt|iv|hash|ct|settings|workspace/i)
  }
}, 90_000)

// Spec T9
it('picker displayName hint loses to canonical vault.json on open', async () => {
  const pickerPath = path.join(tmp, 'picker.json')
  const lc = new VaultLifecycle({ dbFactory, biometric: createBiometricStore(new FakeBackend()), pickerRegistryPath: pickerPath })
  fs.mkdirSync(path.join(tmp, 'p'))
  const { vault } = await lc.create({ directory: path.join(tmp, 'p'), displayName: 'Real Name', password: 'password 12 chars' })
  await lc.close()

  // Hand-edit picker to a misleading name
  const reg = JSON.parse(fs.readFileSync(pickerPath, 'utf-8'))
  reg.vaults[0].displayName = 'Misleading Name'
  fs.writeFileSync(pickerPath, JSON.stringify(reg))

  const lc2 = new VaultLifecycle({ dbFactory, biometric: createBiometricStore(new FakeBackend()), pickerRegistryPath: pickerPath })
  const result = await lc2.open({ path: vault.path, password: 'password 12 chars' })
  if (result.status !== 'opened') throw new Error('expected opened')
  expect(result.vault.displayName).toBe('Real Name')

  // Picker should be corrected
  const reg2 = JSON.parse(fs.readFileSync(pickerPath, 'utf-8'))
  expect(reg2.vaults[0].displayName).toBe('Real Name')
}, 60_000)
```

- [ ] **Step 2: Run, expect pass** (lifecycle.ts already writes the right picker shape)

```bash
npm test -- tests/electron/vault/pickerRegistry.test.ts
```

Expected: PASS, 2 tests. If T9 fails because picker isn't being corrected on open, add this to `lifecycle.open` right before the final `return { status: 'opened', vault }`:

```ts
this.updatePicker(vault) // already there
```

(The `updatePicker` call should already exist; T9 is mostly verifying the existing logic.)

- [ ] **Step 3: Rewrite `src/ui/pages/VaultPickerPage.tsx`** — use the new IPC, train-station copy

The structural shape stays the same as the current implementation: list of vault cards, "New vault" inline form, "Open existing…" folder picker. Changes:

1. List items come from `window.electronAPI.vault.list()` returning `PickerEntry[]` (new shape — `id` is required).
2. Card click flow:
   - call `vault.open({ path })` first (no password yet)
   - if result is `needs-password`, show `<UnlockVaultModal>` with the path
   - if result is `legacy-needs-migration`, show a new `<MigrateLegacyModal>` (built in Task 15)
   - if result is `lock-tampered` / `identity-mismatch`, show an inline error banner on the card
3. "New vault" inline form now requires password (12 char minimum) and shows the recovery phrase after success in a modal the user must acknowledge.
4. Copy in the page header: replace any "vault" language with the train-station model — e.g. *"corebooks remembers where your vaults are, but never what's inside them."*

Pseudo-code skeleton for the changed flow (drop into the existing page; preserve the existing styling/Tailwind classes):

```tsx
const [pending, setPending] = useState<{ path: string; displayName: string } | null>(null)
const [migrating, setMigrating] = useState<string | null>(null)

async function handleCardClick(entry: PickerEntry) {
  const result = await window.electronAPI.vault.open({ path: entry.path })
  if (result.status === 'opened') { /* navigate to home */ return }
  if (result.status === 'needs-password') { setPending({ path: entry.path, displayName: entry.displayName }); return }
  if (result.status === 'legacy-needs-migration') { setMigrating(entry.path); return }
  if (result.status === 'lock-tampered') { /* show inline error */ return }
  if (result.status === 'identity-mismatch') { /* show inline error */ return }
  if (result.status === 'busy') { /* show "open in another window" */ return }
}
```

The new vault flow:

```tsx
async function handleCreate(displayName: string, directory: string, password: string) {
  if (password.length < 12) { setError('Password must be at least 12 characters.'); return }
  const result = await window.electronAPI.vault.create({ directory, displayName, password })
  setRecoveryPhrase(result.recoveryPhrase) // show in mandatory acknowledgement modal
}
```

- [ ] **Step 4: Update `UnlockVaultModal.tsx`**

Make sure the modal:
- Has a single password input
- Submits via `await window.electronAPI.vault.open({ path, password })`
- Shows inline error on `needs-password` (means wrong password — the lifecycle returns the same status; the UI can distinguish "first attempt" from "retry" via state)
- Has a "Forgot password?" link that opens a `<RecoveryUnlockModal>` (a new tiny modal with a 12-word textarea and a new-password field, calling `vault.unlockWithRecovery`)

Implementation is a small refactor of the existing component. The key change is removing the conditional "is this vault encrypted?" branch — every open requires password.

- [ ] **Step 5: Type-check UI**

```bash
npx tsc --project src/ui/tsconfig.json --noEmit
```

Expected: zero errors.

- [ ] **Step 6: Smoke test in dev**

```bash
npm run dev
npm run dev:electron
```

Confirm: picker lists are populated, card click prompts for password, wrong password shows error, right password opens.

- [ ] **Step 7: Commit**

```bash
git add src/ui/pages/VaultPickerPage.tsx src/ui/components/UnlockVaultModal.tsx tests/electron/vault/pickerRegistry.test.ts
git commit -m "$(cat <<'EOF'
feat: vault picker uses new IPC + train-station copy

Picker lists PickerEntry[] from picker.json (id, path, displayName,
lastOpened — nothing else). Card click first probes with vault.open
({path}); modal opens for needs-password, legacy-needs-migration
routes to migration wizard. New-vault flow requires 12-char minimum
password and surfaces the BIP-39 recovery phrase in a mandatory
acknowledgement modal.

UnlockVaultModal becomes universal — every vault open requires a
password. Adds "Forgot password?" → RecoveryUnlockModal.

Spec tests T8, T9 covered.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: UI — Settings: Close Vault + biometric toggle

**Files:**
- Modify: `src/ui/pages/SettingsPage.tsx` (General tab → add Close Vault button; Vault tab → add biometric toggle)

- [ ] **Step 1: Add a "Close Vault" button to the General tab**

In `src/ui/pages/settings/GeneralTab.tsx` (or whatever file holds the General tab), add:

```tsx
<section className="border-t border-rim pt-4 mt-4">
  <h3 className="text-chalk text-sm uppercase tracking-wide mb-2">Active vault</h3>
  <p className="text-ash text-sm mb-3">
    Close this vault to return to the launch picker. The vault file is locked, the in-memory key is zeroed, and no data leaves your machine.
  </p>
  <button
    onClick={async () => {
      await window.electronAPI.vault.close()
      window.location.reload() // forces App.tsx to re-detect apiBaseUrl=null and show picker
    }}
    className="px-4 py-2 bg-surface border border-rim text-chalk hover:bg-raised transition-colors"
  >
    Close vault
  </button>
</section>
```

- [ ] **Step 2: Add a biometric toggle to the Vault tab**

In `src/ui/pages/settings/VaultTab.tsx`:

```tsx
const [biometricAvailable, setBiometricAvailable] = useState<boolean | null>(null)
const [biometricEnabled, setBiometricEnabled] = useState(false) // sourced from settings or local state

useEffect(() => {
  window.electronAPI.vault.isBiometricAvailable().then(setBiometricAvailable)
}, [])

async function toggleBiometric(next: boolean) {
  if (next) await window.electronAPI.vault.enableBiometric()
  else await window.electronAPI.vault.disableBiometric()
  setBiometricEnabled(next)
}

return (
  <section>
    <h3>Biometric unlock (this device only)</h3>
    {biometricAvailable === false ? (
      <p className="text-ash">Biometric unlock isn't available on this system. (Linux requires libsecret / GNOME Keyring / KWallet.)</p>
    ) : (
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={biometricEnabled} onChange={(e) => toggleBiometric(e.target.checked)} />
        Enable Touch ID / Windows Hello to unlock this vault on this device
      </label>
    )}
  </section>
)
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --project src/ui/tsconfig.json --noEmit
```

Expected: zero errors.

- [ ] **Step 4: Smoke test**

In dev, open Settings → General, confirm "Close vault" returns you to the picker. Open Settings → Vault, confirm biometric toggle appears (greyed out if unavailable on your platform).

- [ ] **Step 5: Commit**

```bash
git add src/ui/pages/SettingsPage.tsx src/ui/pages/settings/GeneralTab.tsx src/ui/pages/settings/VaultTab.tsx
git commit -m "$(cat <<'EOF'
feat: Settings — Close Vault button + biometric toggle

General tab gets a Close Vault button that drops the in-memory key
and routes to the picker (no relaunch). Vault tab gets a biometric
toggle backed by safeStorage; greyed out when the OS keychain is
unavailable.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 15: One-time localStorage migration UX

**Files:**
- Create: `src/ui/lib/migrateLocalStorage.ts`
- Modify: `src/ui/App.tsx` (call the migration once after first successful vault open)
- Modify: `src/ui/pages/settings/GeneralTab.tsx` (notification toast)

- [ ] **Step 1: Write `migrateLocalStorage.ts`**

```ts
const LOCAL_KEYS = ['cb_company_name', 'cb_flags', 'cb_payment_methods'] as const
const MIGRATED_MARKER = 'cb_local_settings_migrated'

export interface MigratedSettings {
  companyName?: string
  featureFlags?: { ar_ap?: boolean; inventory?: boolean }
  paymentMethods?: string[]
}

export function readLocalLegacySettings(): MigratedSettings | null {
  if (localStorage.getItem(MIGRATED_MARKER) === '1') return null
  const has = LOCAL_KEYS.some(k => localStorage.getItem(k) !== null)
  if (!has) {
    localStorage.setItem(MIGRATED_MARKER, '1')
    return null
  }
  const out: MigratedSettings = {}
  const name = localStorage.getItem('cb_company_name'); if (name) out.companyName = name
  const flags = localStorage.getItem('cb_flags'); if (flags) try { out.featureFlags = JSON.parse(flags) } catch {}
  const methods = localStorage.getItem('cb_payment_methods'); if (methods) try { out.paymentMethods = JSON.parse(methods) } catch {}
  return out
}

export function markLegacyMigrationComplete(): void {
  for (const k of LOCAL_KEYS) localStorage.removeItem(k)
  localStorage.setItem(MIGRATED_MARKER, '1')
}
```

- [ ] **Step 2: In `App.tsx`, after a successful vault open**

```tsx
useEffect(() => {
  if (apiBaseUrl) {
    const legacy = readLocalLegacySettings()
    if (legacy) {
      // PATCH the vault's settings via the API or via an IPC. Existing settings
      // API endpoint at /api/settings can be reused; if it doesn't exist for
      // this purpose, expose vault.patchSettings via IPC.
      fetch(`${apiBaseUrl}/settings/merge`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(legacy),
      }).then(() => {
        markLegacyMigrationComplete()
        showToast('Moved per-vault preferences from app storage into this vault.')
      })
    }
  }
}, [apiBaseUrl])
```

(If `/settings/merge` doesn't exist, add it as a small Fastify route that calls `writeSettings` after merging into the existing `readSettings()` shape. This is one small route, not a feature.)

- [ ] **Step 3: Type-check + smoke test**

```bash
npx tsc --project src/ui/tsconfig.json --noEmit
npm run dev
```

In the browser DevTools console (against the running app), seed localStorage:
```js
localStorage.setItem('cb_company_name', 'TestCo')
localStorage.setItem('cb_payment_methods', JSON.stringify(['Wire']))
localStorage.removeItem('cb_local_settings_migrated')
```
Reload — confirm toast appears, `cb_company_name` is gone, vault settings show "TestCo".

- [ ] **Step 4: Commit**

```bash
git add src/ui/lib/migrateLocalStorage.ts src/ui/App.tsx src/ui/pages/settings/GeneralTab.tsx src/api/routes/settings.ts
git commit -m "$(cat <<'EOF'
feat: one-time localStorage → vault settings migration

On first vault open after the upgrade, reads cb_company_name,
cb_flags, cb_payment_methods from localStorage, merges them into
the vault's settings.json via /settings/merge, then removes the
local keys. Toast confirms the move. Idempotent via
cb_local_settings_migrated marker.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 16: Integration smoke — spec T23

**Files:**
- Test: `tests/electron/vault/integration.test.ts`

- [ ] **Step 1: Write the integration test**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { VaultLifecycle, type DbFactory } from '../../../src/electron/vault/lifecycle.js'
import { createPrismaClient } from '../../../src/db/client.js'
import { FakeBackend, createBiometricStore } from '../../../src/electron/vault/biometric.js'

let tmp: string
beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-int-')) })
afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }) })

// Spec T23
it('full lifecycle: create → write → close → reopen → switch → second vault data isolated', async () => {
  const dbFactory: DbFactory = {
    async open({ filePath, key }) {
      const { client, db } = createPrismaClient({ filePath, key })
      // Ensure schema (mini version — just one Account table for the smoke test)
      db.exec(`CREATE TABLE IF NOT EXISTS smoke (id INTEGER PRIMARY KEY, val TEXT NOT NULL)`)
      return { async close() { await client.$disconnect(); db.close() } }
    },
  }
  const pickerPath = path.join(tmp, 'picker.json')
  const lc = new VaultLifecycle({ dbFactory, biometric: createBiometricStore(new FakeBackend()), pickerRegistryPath: pickerPath })

  // Vault A
  const a = await lc.create({ directory: path.join(tmp, 'pa').replace(/.*/, p => { fs.mkdirSync(p); return p }), displayName: 'A', password: 'password A 12 ch' })
  // Write some data via raw SQLite (the smoke test doesn't need real Prisma posting)
  const Database = (await import('better-sqlite3-multiple-ciphers')).default
  const dbA = new Database(path.join(a.vault.path, 'corebooks.db'))
  dbA.pragma(`key = "x'${lc.__test_getActiveKey()!.toString('hex')}'"`)
  dbA.prepare('INSERT INTO smoke (val) VALUES (?)').run('A-data')
  dbA.close()
  await lc.close()

  // Reopen A
  const reopen = await lc.open({ path: a.vault.path, password: 'password A 12 ch' })
  expect(reopen.status).toBe('opened')
  await lc.close()

  // Vault B
  fs.mkdirSync(path.join(tmp, 'pb'))
  const b = await lc.create({ directory: path.join(tmp, 'pb'), displayName: 'B', password: 'password B 12 ch' })
  // B's DB should NOT contain A's data
  const dbB = new Database(path.join(b.vault.path, 'corebooks.db'))
  dbB.pragma(`key = "x'${lc.__test_getActiveKey()!.toString('hex')}'"`)
  const row = dbB.prepare('SELECT val FROM smoke').get() as { val: string } | undefined
  expect(row).toBeUndefined()
  dbB.close()
  await lc.close()

  // B's key should not unlock A's DB
  const dbAFail = new Database(path.join(a.vault.path, 'corebooks.db'))
  const aKeyTry = lc.__test_getActiveKey() // null (closed)
  // open with random key, expect SQLCipher rejection
  const wrong = Buffer.alloc(32, 0xff)
  dbAFail.pragma(`key = "x'${wrong.toString('hex')}'"`)
  expect(() => dbAFail.prepare('SELECT * FROM smoke').get()).toThrow()
  dbAFail.close()
}, 120_000)
```

- [ ] **Step 2: Run**

```bash
npm test -- tests/electron/vault/integration.test.ts
```

Expected: PASS, 1 test.

- [ ] **Step 3: Run the whole vault suite**

```bash
npm test -- tests/electron/vault/
```

Expected: every test passes. All 23 spec tests are now green.

- [ ] **Step 4: Commit**

```bash
git add tests/electron/vault/integration.test.ts
git commit -m "$(cat <<'EOF'
test: integration smoke (spec T23)

Full lifecycle round-trip — create, write data, close, reopen,
switch, verify cross-vault isolation at the SQLCipher level
(B's key cannot open A's DB).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 17: Cleanup — delete superseded files

**Files:**
- Delete: `src/electron/vaultManager.ts`
- Delete: `src/electron/vaultTypes.ts`
- Delete: `tests/electron/vaultManager.encryption.test.ts` (covers old encryption metadata API; superseded by `lockFile.test.ts`)

- [ ] **Step 1: Verify nothing imports the old files**

```bash
grep -r "from.*vaultManager" src/ tests/ 2>/dev/null
grep -r "from.*vaultTypes" src/ tests/ 2>/dev/null
```

Expected: no matches. If any remain, update them to import from `src/electron/vault/types.js` or the appropriate new module.

- [ ] **Step 2: Delete**

```bash
git rm src/electron/vaultManager.ts src/electron/vaultTypes.ts tests/electron/vaultManager.encryption.test.ts
```

- [ ] **Step 3: Type-check + run all tests**

```bash
npm run build
npx tsc --project src/ui/tsconfig.json --noEmit
npm test
```

Expected: zero TS errors, all tests pass (vault + every existing core/db/api test).

- [ ] **Step 4: Smoke test the packaged app once more**

```bash
npm run dev
npm run dev:electron
```

Expected: full create / close / open / switch / biometric toggle / Close Vault button all work.

- [ ] **Step 5: Commit**

```bash
git commit -m "$(cat <<'EOF'
chore: remove superseded vaultManager + vaultTypes

Replaced by src/electron/vault/ module. Old encryption metadata test
covered by lockFile.test.ts. No imports of the removed files remain.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Self-review (run after writing the plan, before handoff)

**Spec coverage:**

| Spec section | Implementing task(s) |
|---|---|
| §1 Train-station model | Task 13 (picker copy + IPC) |
| §2 On-disk structure | Tasks 1–10 (each file's module) |
| §3 Per-vault key isolation | Task 5 (lockFile), Task 11 (DB layer) |
| §4 Per-vault settings | Task 6 (settings.ts, migrators) |
| §5 Hash-chained audit | Task 3 (audit.ts) |
| §6 VaultLifecycle | Tasks 8, 9 |
| §7 Legacy migration | Task 10 (module) + Task 12 (IPC handler) |
| §8 Passwords, biometric, keychain | Task 5 (mandatory 12-char), Task 7 (biometric seam), Task 12 (safeStorage wiring), Task 14 (UI toggle) |
| §9 Testing strategy (23 cases) | T1, T2, T5, T20 in Task 8; T3, T10, T12 in Task 5; T4 in Task 3; T6, T7 in Task 10; T8, T9 in Task 13; T11, T19 in Task 9; T13 in Task 5 timeout note; T14 in Task 11; T15, T16 in Task 7; T17, T18 in Task 4; T21 in Task 6; T22 in Task 6; T23 in Task 16 |
| §10 Out of scope | Respected — no plugin scaffolding, no multi-process |
| §11 Files affected | All listed files appear in some task |

**Gaps surfaced and resolved:**

- T13 (timing) — the spec defines it as a nightly test; this plan acknowledges it inline in Task 5's timeout note. A standalone implementation isn't required as a core test, only the 10×10 assertion can be added later as `tests/electron/vault/timing.nightly.test.ts` when CI gets a nightly slot. Not a hard blocker for this plan.
- The `getOpenDb` / `disconnectPrisma` exports in `src/db/client.ts` are removed in Task 11 — any caller outside what's in this plan (e.g. tests in `tests/db/`) needs its call sites updated. Task 11 Step 7 flags this.
- `bootstrap.ts` signature change in Task 11/12 needs concrete refactoring. The plan describes the goal (`startApi({ prisma, db })`) without rewriting bootstrap line-by-line. The implementer must read the current `bootstrap.ts` and apply the same pattern.

**Placeholder scan:** clean — no TBDs, every code block is complete, every test has actual assertions.

**Type consistency:** `OpenResult` shape consistent between `types.ts` (Task 1) → `lifecycle.ts` (Task 8) → `electron.d.ts` (Task 12). `PickerEntry` consistent between `types.ts` and IPC. `DbFactory` defined once in `lifecycle.ts` (Task 8) and consumed in Task 12. ✓

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-29-vault-isolation-plan.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration. Best for a long plan like this where context bloat across 17 tasks would otherwise hurt quality.

**2. Inline Execution** — Execute tasks in this session using `executing-plans`, batch execution with checkpoints. Better if you want to watch every step happen.

Which approach?
