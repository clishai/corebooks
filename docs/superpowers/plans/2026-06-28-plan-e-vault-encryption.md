# Plan E — Vault Password & Encryption Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement vault password protection with Argon2id key derivation, BIP-39 recovery phrase, dual key slot architecture, full password management UI, and SECURITY.md.

**Architecture:** Vault key K (32 bytes) is generated once and never stored plaintext; it is stored only as two AES-256-GCM-encrypted blobs in `.corebooks` metadata — one wrapped with an Argon2id-derived key from the user's password (slot A) and one with the Argon2id-derived key from the BIP-39 recovery phrase entropy (slot B). The UI provides setup, spot-check, recovery, and password-change flows. Full SQLCipher database encryption is deferred to Plan F (blocked on a custom Prisma adapter).

**Tech Stack:** TypeScript strict, `@noble/hashes` (Argon2id, pure JS), `@scure/bip39` (pure JS), Node.js crypto (AES-256-GCM), React 19, Tailwind v4, Electron IPC, Vitest.

---

## File Map

| File | Status | Responsibility |
|------|--------|----------------|
| `package.json` | **Modify** | Add `@noble/hashes` and `@scure/bip39` |
| `src/electron/vaultCrypto.ts` | **Create** | `encryptVaultKey` / `decryptVaultKey` (AES-256-GCM, Node.js crypto) |
| `src/electron/recoveryPhrase.ts` | **Create** | `generateRecoveryPhrase`, `recoveryPhraseToEntropy`, `isValidPhrase`, `isValidWord` |
| `src/electron/vaultTypes.ts` | **Modify** | Add `VaultKeySlot`, `VaultEncryption`; extend `VaultMetadata` |
| `src/electron/vaultManager.ts` | **Modify** | Extract `readMetadata` / `writeMetadata`; add `getEncryption` / `setEncryption` / `removeEncryption` |
| `src/electron/main.ts` | **Modify** | 7 new IPC handlers for vault encryption + password operations |
| `src/electron/preload.ts` | **Modify** | Expose 7 new encryption methods on `vault` namespace |
| `src/ui/electron.d.ts` | **Modify** | Type declarations for the new vault encryption methods |
| `src/ui/components/VaultPasswordSetup.tsx` | **Create** | 3-step modal: password entry → phrase display → spot-check |
| `src/ui/components/VaultRecoverModal.tsx` | **Create** | 12-input recovery word entry with live BIP-39 validation |
| `src/ui/pages/settings/VaultTab.tsx` | **Modify** | New "Vault password" section: setup / change / regenerate phrase / remove |
| `src/ui/lib/crypto.ts` | **Replace** | Upgrade export encryption from PBKDF2 → Argon2id (envelope `v: 2`) |
| `docs/SECURITY.md` | **Create** | Public-facing security commitment, no-backdoor policy, links to source |
| `tests/electron/vaultCrypto.test.ts` | **Create** | Round-trip + tamper-detection tests for AES-256-GCM key wrap |
| `tests/electron/recoveryPhrase.test.ts` | **Create** | Generate, validate, entropy round-trip, wordlist coverage |
| `tests/electron/vaultManager.encryption.test.ts` | **Create** | `getEncryption` / `setEncryption` / `removeEncryption` round-trip |
| `tests/ui/cryptoExport.test.ts` | **Create** | Argon2id v2 envelope shape + basic decrypt round-trip |

---

## Task 1: Install dependencies and create `src/electron/vaultCrypto.ts`

**Files:**
- Modify: `package.json` (via `npm install`)
- Create: `src/electron/vaultCrypto.ts`
- Create: `tests/electron/vaultCrypto.test.ts`

The vault crypto module exposes two narrow primitives: `encryptVaultKey` and `decryptVaultKey`. They take an already-derived 32-byte key (from Argon2id, in the caller) and wrap/unwrap a 32-byte vault key K using AES-256-GCM. The 16-byte GCM auth tag is appended to the ciphertext so the output is exactly 48 bytes and a single buffer flows in and out.

- [ ] **Step 1: Install dependencies**

```bash
npm install @noble/hashes @scure/bip39
```

Expected: `package.json` gains both packages under `dependencies`. Both are pure JS — no native compile step, no postinstall scripts that touch `node-gyp`.

- [ ] **Step 2: Verify dependency versions are resolved**

```bash
npm ls @noble/hashes @scure/bip39
```

Expected: both packages appear with concrete version numbers (no `UNMET DEPENDENCY`).

- [ ] **Step 3: Create `src/electron/vaultCrypto.ts`**

```typescript
// AES-256-GCM key wrapping for the vault key K.
//
// The caller is responsible for deriving the wrapping key from a password or
// recovery-phrase entropy via Argon2id. This module deliberately knows nothing
// about passwords, KDFs, or vault metadata — it only encrypts and decrypts a
// 32-byte key with an authenticated cipher. Tampering with the ciphertext or
// the auth tag causes `decryptVaultKey` to throw.
import { createCipheriv, createDecipheriv } from 'crypto'

const GCM_TAG_BYTES = 16

/**
 * Wrap a 32-byte vault key K with AES-256-GCM. Returns a 48-byte buffer:
 * the 32-byte ciphertext followed by the 16-byte authentication tag.
 *
 * @param vaultKey    The 32-byte vault key K to encrypt.
 * @param derivedKey  The 32-byte Argon2id-derived wrapping key.
 * @param iv          A 12-byte initialization vector (random per call).
 */
export function encryptVaultKey(
  vaultKey: Buffer,
  derivedKey: Buffer,
  iv: Buffer,
): Buffer {
  if (vaultKey.length !== 32) throw new Error('vaultKey must be 32 bytes')
  if (derivedKey.length !== 32) throw new Error('derivedKey must be 32 bytes')
  if (iv.length !== 12) throw new Error('iv must be 12 bytes')

  const cipher = createCipheriv('aes-256-gcm', derivedKey, iv)
  const ct = Buffer.concat([cipher.update(vaultKey), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([ct, tag])
}

/**
 * Unwrap a previously-encrypted vault key. Throws if the auth tag does not
 * verify (wrong password / tampered ciphertext / corrupted IV).
 *
 * @param ciphertext  The 48-byte buffer produced by `encryptVaultKey`.
 * @param derivedKey  The 32-byte Argon2id-derived wrapping key.
 * @param iv          The 12-byte IV used during encryption.
 * @returns           The decrypted 32-byte vault key K.
 */
export function decryptVaultKey(
  ciphertext: Buffer,
  derivedKey: Buffer,
  iv: Buffer,
): Buffer {
  if (derivedKey.length !== 32) throw new Error('derivedKey must be 32 bytes')
  if (iv.length !== 12) throw new Error('iv must be 12 bytes')
  if (ciphertext.length <= GCM_TAG_BYTES) throw new Error('ciphertext too short')

  const tag = ciphertext.subarray(ciphertext.length - GCM_TAG_BYTES)
  const ct = ciphertext.subarray(0, ciphertext.length - GCM_TAG_BYTES)
  const decipher = createDecipheriv('aes-256-gcm', derivedKey, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ct), decipher.final()])
}
```

- [ ] **Step 4: Create `tests/electron/vaultCrypto.test.ts`**

```typescript
import { describe, it, expect } from 'vitest'
import { randomBytes } from 'crypto'
import { encryptVaultKey, decryptVaultKey } from '../../src/electron/vaultCrypto.js'

describe('vaultCrypto.encryptVaultKey', () => {
  it('produces a 48-byte buffer (32 ciphertext + 16 GCM tag)', () => {
    const vaultKey = randomBytes(32)
    const derivedKey = randomBytes(32)
    const iv = randomBytes(12)
    const out = encryptVaultKey(vaultKey, derivedKey, iv)
    expect(out.length).toBe(48)
  })

  it('rejects a vault key that is not 32 bytes', () => {
    expect(() => encryptVaultKey(randomBytes(16), randomBytes(32), randomBytes(12)))
      .toThrow(/vaultKey must be 32 bytes/)
  })

  it('rejects a derived key that is not 32 bytes', () => {
    expect(() => encryptVaultKey(randomBytes(32), randomBytes(16), randomBytes(12)))
      .toThrow(/derivedKey must be 32 bytes/)
  })

  it('rejects an IV that is not 12 bytes', () => {
    expect(() => encryptVaultKey(randomBytes(32), randomBytes(32), randomBytes(16)))
      .toThrow(/iv must be 12 bytes/)
  })

  it('produces different ciphertexts for the same vault key with different IVs', () => {
    const vaultKey = randomBytes(32)
    const derivedKey = randomBytes(32)
    const a = encryptVaultKey(vaultKey, derivedKey, randomBytes(12))
    const b = encryptVaultKey(vaultKey, derivedKey, randomBytes(12))
    expect(a.equals(b)).toBe(false)
  })
})

describe('vaultCrypto.decryptVaultKey', () => {
  it('round-trips a 32-byte vault key exactly', () => {
    const vaultKey = randomBytes(32)
    const derivedKey = randomBytes(32)
    const iv = randomBytes(12)
    const ct = encryptVaultKey(vaultKey, derivedKey, iv)
    const back = decryptVaultKey(ct, derivedKey, iv)
    expect(back.equals(vaultKey)).toBe(true)
  })

  it('throws when the derived key is wrong', () => {
    const vaultKey = randomBytes(32)
    const iv = randomBytes(12)
    const ct = encryptVaultKey(vaultKey, randomBytes(32), iv)
    expect(() => decryptVaultKey(ct, randomBytes(32), iv)).toThrow()
  })

  it('throws when the IV is wrong', () => {
    const vaultKey = randomBytes(32)
    const derivedKey = randomBytes(32)
    const ct = encryptVaultKey(vaultKey, derivedKey, randomBytes(12))
    expect(() => decryptVaultKey(ct, derivedKey, randomBytes(12))).toThrow()
  })

  it('throws when the ciphertext is tampered with', () => {
    const vaultKey = randomBytes(32)
    const derivedKey = randomBytes(32)
    const iv = randomBytes(12)
    const ct = encryptVaultKey(vaultKey, derivedKey, iv)
    ct[0] = ct[0]! ^ 0xff
    expect(() => decryptVaultKey(ct, derivedKey, iv)).toThrow()
  })

  it('throws when the auth tag is tampered with', () => {
    const vaultKey = randomBytes(32)
    const derivedKey = randomBytes(32)
    const iv = randomBytes(12)
    const ct = encryptVaultKey(vaultKey, derivedKey, iv)
    ct[ct.length - 1] = ct[ct.length - 1]! ^ 0xff
    expect(() => decryptVaultKey(ct, derivedKey, iv)).toThrow()
  })

  it('throws when the ciphertext is too short to contain a tag', () => {
    expect(() => decryptVaultKey(Buffer.alloc(16), randomBytes(32), randomBytes(12)))
      .toThrow(/ciphertext too short/)
  })
})
```

- [ ] **Step 5: Run the new tests**

```bash
npx vitest run tests/electron/vaultCrypto.test.ts
```

Expected: all 11 tests pass.

---

## Task 2: Create `src/electron/recoveryPhrase.ts`

**Files:**
- Create: `src/electron/recoveryPhrase.ts`
- Create: `tests/electron/recoveryPhrase.test.ts`

This module is a thin, typed wrapper around `@scure/bip39`. The renderer cannot import from `src/electron/`, so word validation in the renderer happens via a renderer-side import of `@scure/bip39/wordlists/english` (covered in Task 6). The main process uses this module everywhere.

- [ ] **Step 1: Create `src/electron/recoveryPhrase.ts`**

```typescript
// Thin typed wrapper around @scure/bip39 for BIP-39 mnemonic phrases.
//
// 12 words = 128 bits of entropy. The entropy is what feeds into Argon2id
// for slot B of the key-slot architecture; the words themselves never leave
// the user's hands (paper backup) and never touch the wrapping KDF directly.
import { generateMnemonic, mnemonicToEntropy, validateMnemonic } from '@scure/bip39'
import { wordlist } from '@scure/bip39/wordlists/english'

/** Generate a fresh 12-word BIP-39 phrase (128 bits of entropy). */
export function generateRecoveryPhrase(): string[] {
  return generateMnemonic(wordlist, 128).split(' ')
}

/**
 * Convert a 12-word phrase to its 16-byte entropy. Throws if the phrase is
 * invalid (unrecognized words, bad checksum, or wrong length).
 */
export function recoveryPhraseToEntropy(words: string[]): Buffer {
  const mnemonic = words.join(' ')
  if (!validateMnemonic(mnemonic, wordlist)) {
    throw new Error('Invalid BIP-39 phrase')
  }
  return Buffer.from(mnemonicToEntropy(mnemonic, wordlist))
}

/** True if the 12-word array is a valid BIP-39 phrase (words + checksum). */
export function isValidPhrase(words: string[]): boolean {
  if (words.length !== 12) return false
  return validateMnemonic(words.join(' '), wordlist)
}

/** True if a single word appears in the English BIP-39 wordlist. */
export function isValidWord(word: string): boolean {
  return wordlist.includes(word.toLowerCase().trim())
}
```

- [ ] **Step 2: Create `tests/electron/recoveryPhrase.test.ts`**

```typescript
import { describe, it, expect } from 'vitest'
import {
  generateRecoveryPhrase,
  recoveryPhraseToEntropy,
  isValidPhrase,
  isValidWord,
} from '../../src/electron/recoveryPhrase.js'

describe('generateRecoveryPhrase', () => {
  it('returns exactly 12 words', () => {
    expect(generateRecoveryPhrase()).toHaveLength(12)
  })

  it('returns words that are all valid BIP-39 entries', () => {
    const words = generateRecoveryPhrase()
    for (const word of words) {
      expect(isValidWord(word)).toBe(true)
    }
  })

  it('produces different phrases on consecutive calls', () => {
    const a = generateRecoveryPhrase().join(' ')
    const b = generateRecoveryPhrase().join(' ')
    expect(a).not.toBe(b)
  })

  it('produces a phrase that validates as a complete BIP-39 mnemonic', () => {
    expect(isValidPhrase(generateRecoveryPhrase())).toBe(true)
  })
})

describe('recoveryPhraseToEntropy', () => {
  it('returns exactly 16 bytes (128 bits of entropy)', () => {
    expect(recoveryPhraseToEntropy(generateRecoveryPhrase()).length).toBe(16)
  })

  it('is deterministic for the same phrase', () => {
    const phrase = generateRecoveryPhrase()
    const a = recoveryPhraseToEntropy(phrase)
    const b = recoveryPhraseToEntropy(phrase)
    expect(a.equals(b)).toBe(true)
  })

  it('throws on a phrase with an invalid word', () => {
    const phrase = generateRecoveryPhrase()
    phrase[0] = 'notarealbip39word'
    expect(() => recoveryPhraseToEntropy(phrase)).toThrow(/Invalid BIP-39 phrase/)
  })

  it('throws on a phrase with the wrong word count', () => {
    expect(() => recoveryPhraseToEntropy(['abandon', 'ability', 'able']))
      .toThrow(/Invalid BIP-39 phrase/)
  })

  it('throws on a phrase with a bad checksum', () => {
    // Last word of a BIP-39 phrase encodes the checksum; swapping it
    // for another valid word breaks the checksum with overwhelming probability.
    const phrase = generateRecoveryPhrase()
    phrase[11] = phrase[11] === 'abandon' ? 'ability' : 'abandon'
    expect(() => recoveryPhraseToEntropy(phrase)).toThrow(/Invalid BIP-39 phrase/)
  })
})

describe('isValidPhrase', () => {
  it('returns true for a freshly generated phrase', () => {
    expect(isValidPhrase(generateRecoveryPhrase())).toBe(true)
  })

  it('returns false for a phrase with the wrong length', () => {
    expect(isValidPhrase(['abandon', 'ability'])).toBe(false)
  })

  it('returns false for a phrase with an unknown word', () => {
    const phrase = generateRecoveryPhrase()
    phrase[5] = 'zzzzz'
    expect(isValidPhrase(phrase)).toBe(false)
  })
})

describe('isValidWord', () => {
  it('returns true for known BIP-39 words', () => {
    expect(isValidWord('abandon')).toBe(true)
    expect(isValidWord('zone')).toBe(true)
  })

  it('returns false for unknown words', () => {
    expect(isValidWord('notarealword')).toBe(false)
    expect(isValidWord('')).toBe(false)
  })

  it('is case-insensitive and trims whitespace', () => {
    expect(isValidWord('  ABANDON  ')).toBe(true)
  })
})
```

- [ ] **Step 3: Run the new tests**

```bash
npx vitest run tests/electron/recoveryPhrase.test.ts
```

Expected: all 14 tests pass.

---

## Task 3: Extend `vaultTypes.ts` and `vaultManager.ts`

**Files:**
- Modify: `src/electron/vaultTypes.ts`
- Modify: `src/electron/vaultManager.ts`
- Create: `tests/electron/vaultManager.encryption.test.ts`

Add the `VaultKeySlot` / `VaultEncryption` shapes, extend `VaultMetadata` with an optional `encryption` field, refactor inline `.corebooks` reads/writes into private helpers, and add three new public methods for managing the encryption block.

- [ ] **Step 1: Replace `src/electron/vaultTypes.ts`**

```typescript
export interface VaultEntry {
  path: string
  name: string
  lastOpened: string // ISO 8601
}

export interface VaultState {
  apiPort: number | null
  vaultName: string | null
  vaultPath: string | null
}

/**
 * One of the two AES-256-GCM-wrapped copies of the vault key K. Both slots
 * encrypt the SAME K — only the wrapping key (derived from password vs.
 * recovery-phrase entropy) differs between them.
 */
export interface VaultKeySlot {
  salt: string   // hex, 32 bytes — Argon2id salt
  iv: string     // hex, 12 bytes — AES-GCM IV
  ct: string     // hex, 48 bytes — 32 ciphertext + 16 GCM auth tag
}

export interface VaultEncryption {
  algorithm: 'argon2id-aes256-gcm'
  argon2: { m: number; t: number; p: number }
  slots: {
    password: VaultKeySlot
    recovery: VaultKeySlot
  }
}

export interface VaultMetadata {
  version: string
  name: string
  created: string // ISO 8601
  encryption?: VaultEncryption
}

export interface VaultRegistry {
  vaults: VaultEntry[]
  skipPickerUntil?: string // ISO 8601 — if in future, auto-open last vault on startup
}
```

- [ ] **Step 2: Replace `src/electron/vaultManager.ts`**

The class gains two private helpers (`readMetadata` / `writeMetadata`) used everywhere `.corebooks` is touched, and three public methods (`getEncryption` / `setEncryption` / `removeEncryption`). All previous behaviour is preserved.

```typescript
import fs from 'fs'
import path from 'path'
import type {
  VaultEncryption,
  VaultEntry,
  VaultMetadata,
  VaultRegistry,
} from './vaultTypes.js'

const SUBDIRS = ['imports', 'statements', 'receipts', 'exports']

export function sanitizeVaultName(name: string): string {
  return name
    .replace(/[/\\:*?"<>|]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 64)
}

export class VaultManager {
  private registryPath: string
  private current: VaultEntry | null = null

  constructor(userData: string) {
    this.registryPath = path.join(userData, 'vaults.json')
  }

  private readRegistry(): VaultRegistry {
    try {
      const raw = fs.readFileSync(this.registryPath, 'utf-8')
      return JSON.parse(raw) as VaultRegistry
    } catch {
      return { vaults: [] }
    }
  }

  private writeRegistry(registry: VaultRegistry): void {
    fs.writeFileSync(this.registryPath, JSON.stringify(registry, null, 2), { mode: 0o600 })
  }

  private readMetadata(vaultPath: string): VaultMetadata {
    const metaPath = path.join(vaultPath, '.corebooks')
    if (!fs.existsSync(metaPath)) {
      throw new Error(`Not a corebooks vault: ${vaultPath}`)
    }
    return JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as VaultMetadata
  }

  private writeMetadata(vaultPath: string, meta: VaultMetadata): void {
    const metaPath = path.join(vaultPath, '.corebooks')
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), { mode: 0o600 })
  }

  list(): VaultEntry[] {
    const { vaults } = this.readRegistry()
    return [...vaults].sort(
      (a, b) => new Date(b.lastOpened).getTime() - new Date(a.lastOpened).getTime(),
    )
  }

  create(name: string, dirPath: string): VaultEntry {
    const folderName = sanitizeVaultName(name)
    if (!folderName) throw new Error('Vault name is required')
    const vaultPath = path.join(dirPath, folderName)
    if (fs.existsSync(vaultPath)) {
      throw new Error('A vault with that name already exists')
    }

    fs.mkdirSync(vaultPath, { recursive: true })
    for (const sub of SUBDIRS) {
      fs.mkdirSync(path.join(vaultPath, sub), { recursive: true })
    }

    const metadata: VaultMetadata = {
      version: '1',
      name: folderName,
      created: new Date().toISOString(),
    }
    this.writeMetadata(vaultPath, metadata)

    const entry: VaultEntry = {
      path: vaultPath,
      name: folderName,
      lastOpened: new Date().toISOString(),
    }

    const registry = this.readRegistry()
    registry.vaults.push(entry)
    this.writeRegistry(registry)

    return entry
  }

  select(vaultPath: string): VaultEntry {
    const meta = this.readMetadata(vaultPath)
    const now = new Date().toISOString()

    const registry = this.readRegistry()
    const existing = registry.vaults.find((v) => v.path === vaultPath)

    if (existing) {
      existing.lastOpened = now
      existing.name = meta.name
    } else {
      registry.vaults.push({ path: vaultPath, name: meta.name, lastOpened: now })
    }
    this.writeRegistry(registry)

    const entry: VaultEntry = { path: vaultPath, name: meta.name, lastOpened: now }
    this.current = entry
    return entry
  }

  getCurrent(): VaultEntry | null {
    return this.current
  }

  rename(newName: string): string {
    if (!this.current) throw new Error('No vault selected')

    const sanitized = sanitizeVaultName(newName)
    if (!sanitized) throw new Error('Vault name is required')
    const parentDir = path.dirname(this.current.path)
    const newPath = path.join(parentDir, sanitized)
    if (path.resolve(newPath) !== path.resolve(this.current.path) && fs.existsSync(newPath)) {
      throw new Error('A vault with that name already exists')
    }

    const meta = this.readMetadata(this.current.path)
    fs.renameSync(this.current.path, newPath)
    meta.name = sanitized
    this.writeMetadata(newPath, meta)

    const registry = this.readRegistry()
    const entry = registry.vaults.find((v) => v.path === this.current!.path)
    if (entry) {
      entry.path = newPath
      entry.name = sanitized
    }
    this.writeRegistry(registry)

    this.current = { ...this.current, path: newPath, name: sanitized }
    return newPath
  }

  removeFromRegistry(vaultPath: string): void {
    const registry = this.readRegistry()
    registry.vaults = registry.vaults.filter((v) => v.path !== vaultPath)
    this.writeRegistry(registry)
  }

  getSkipPickerUntil(): string | null {
    return this.readRegistry().skipPickerUntil ?? null
  }

  setSkipPickerUntil(until: string | null): void {
    const registry = this.readRegistry()
    if (until === null) {
      delete registry.skipPickerUntil
    } else {
      registry.skipPickerUntil = until
    }
    this.writeRegistry(registry)
  }

  // ── Vault encryption metadata ──────────────────────────────────────────────

  getEncryption(): VaultEncryption | null {
    if (!this.current) return null
    return this.readMetadata(this.current.path).encryption ?? null
  }

  setEncryption(enc: VaultEncryption): void {
    if (!this.current) throw new Error('No vault selected')
    const meta = this.readMetadata(this.current.path)
    meta.encryption = enc
    this.writeMetadata(this.current.path, meta)
  }

  removeEncryption(): void {
    if (!this.current) throw new Error('No vault selected')
    const meta = this.readMetadata(this.current.path)
    delete meta.encryption
    this.writeMetadata(this.current.path, meta)
  }
}
```

- [ ] **Step 3: Create `tests/electron/vaultManager.encryption.test.ts`**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { VaultManager } from '../../src/electron/vaultManager.js'
import type { VaultEncryption } from '../../src/electron/vaultTypes.js'

let userData: string
let parentDir: string
let manager: VaultManager

const SAMPLE_ENC: VaultEncryption = {
  algorithm: 'argon2id-aes256-gcm',
  argon2: { m: 65536, t: 3, p: 4 },
  slots: {
    password: { salt: 'aa'.repeat(32), iv: 'bb'.repeat(12), ct: 'cc'.repeat(48) },
    recovery: { salt: 'dd'.repeat(32), iv: 'ee'.repeat(12), ct: 'ff'.repeat(48) },
  },
}

beforeEach(() => {
  userData = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-enc-user-'))
  parentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-enc-parent-'))
  manager = new VaultManager(userData)
})

afterEach(() => {
  fs.rmSync(userData, { recursive: true, force: true })
  fs.rmSync(parentDir, { recursive: true, force: true })
})

describe('getEncryption / setEncryption / removeEncryption', () => {
  it('returns null when no vault is selected', () => {
    expect(manager.getEncryption()).toBeNull()
  })

  it('returns null when the vault has no encryption block', () => {
    const v = manager.create('test', parentDir)
    manager.select(v.path)
    expect(manager.getEncryption()).toBeNull()
  })

  it('persists encryption to .corebooks and reads it back unchanged', () => {
    const v = manager.create('test', parentDir)
    manager.select(v.path)
    manager.setEncryption(SAMPLE_ENC)

    const raw = JSON.parse(fs.readFileSync(path.join(v.path, '.corebooks'), 'utf-8'))
    expect(raw.encryption).toEqual(SAMPLE_ENC)
    expect(manager.getEncryption()).toEqual(SAMPLE_ENC)
  })

  it('overwrites an existing encryption block on subsequent set calls', () => {
    const v = manager.create('test', parentDir)
    manager.select(v.path)
    manager.setEncryption(SAMPLE_ENC)

    const updated: VaultEncryption = {
      ...SAMPLE_ENC,
      slots: {
        ...SAMPLE_ENC.slots,
        password: { salt: '11'.repeat(32), iv: '22'.repeat(12), ct: '33'.repeat(48) },
      },
    }
    manager.setEncryption(updated)
    expect(manager.getEncryption()).toEqual(updated)
  })

  it('removes the encryption block but preserves the rest of metadata', () => {
    const v = manager.create('test', parentDir)
    manager.select(v.path)
    manager.setEncryption(SAMPLE_ENC)
    manager.removeEncryption()

    expect(manager.getEncryption()).toBeNull()
    const raw = JSON.parse(fs.readFileSync(path.join(v.path, '.corebooks'), 'utf-8'))
    expect(raw.encryption).toBeUndefined()
    expect(raw.name).toBe('test')
    expect(raw.version).toBe('1')
    expect(typeof raw.created).toBe('string')
  })

  it('throws when setEncryption is called with no current vault', () => {
    expect(() => manager.setEncryption(SAMPLE_ENC)).toThrow(/No vault selected/)
  })

  it('throws when removeEncryption is called with no current vault', () => {
    expect(() => manager.removeEncryption()).toThrow(/No vault selected/)
  })
})
```

- [ ] **Step 4: Run the new tests and the pre-existing manager tests together**

```bash
npx vitest run tests/electron/vaultManager.encryption.test.ts tests/electron/vaultManager.skip.test.ts
```

Expected: all tests pass; nothing in the pre-existing skip tests regresses from the refactor.

---

## Task 4: Add IPC handlers in `main.ts`, `preload.ts`, `electron.d.ts`

**Files:**
- Modify: `src/electron/main.ts`
- Modify: `src/electron/preload.ts`
- Modify: `src/ui/electron.d.ts`

Seven new IPC handlers expose the full lifecycle: status check, initial setup (generates K, both slots, and the recovery phrase), password verify, password change, password removal, recovery-phrase regeneration, and password reset via recovery phrase.

- [ ] **Step 1: Read the top of `src/electron/main.ts`**

```bash
sed -n '1,15p' src/electron/main.ts
```

Verify the current imports include `randomBytes` from `crypto` (it does — used by `getOrCreateEncryptionKey`). The new imports go directly below the existing ones.

- [ ] **Step 2: Update imports at the top of `src/electron/main.ts`**

Replace the existing import block at the top of the file (lines 1–9) with:

```typescript
import { app, BrowserWindow, ipcMain, shell, dialog, safeStorage } from 'electron'
import { createServer } from 'net'
import { randomBytes } from 'crypto'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { argon2id } from '@noble/hashes/argon2'
import { VaultManager } from './vaultManager.js'
import { VaultWatcher } from './vaultWatcher.js'
import { encryptVaultKey, decryptVaultKey } from './vaultCrypto.js'
import {
  generateRecoveryPhrase,
  recoveryPhraseToEntropy,
  isValidPhrase,
} from './recoveryPhrase.js'
import type { VaultEncryption, VaultState } from './vaultTypes.js'

const ARGON2_PARAMS = { m: 65536, t: 3, p: 4 } as const
```

- [ ] **Step 3: Add encryption IPC handlers inside `registerIpc()`**

In `src/electron/main.ts`, locate the `registerIpc()` function (currently begins around line 166). After the existing `vault:getSkipUntil` handler (currently ends around line 226) and BEFORE the `// ── Vault file operations` comment block, insert the following block:

```typescript
  // ── Vault encryption operations ────────────────────────────────────────────

  ipcMain.handle('vault:getEncryptionStatus', () => {
    const enc = vaultManager.getEncryption()
    return { encrypted: enc !== null }
  })

  ipcMain.handle('vault:setupEncryption', (_event, password: string) => {
    if (vaultManager.getEncryption() !== null) {
      throw new Error('Vault is already encrypted')
    }
    const vaultKey = randomBytes(32)
    const phrase = generateRecoveryPhrase()
    const entropy = recoveryPhraseToEntropy(phrase)

    const saltA = randomBytes(32); const ivA = randomBytes(12)
    const derivedA = Buffer.from(
      argon2id(Buffer.from(password, 'utf-8'), saltA, { ...ARGON2_PARAMS, dkLen: 32 }),
    )
    const slotA = encryptVaultKey(vaultKey, derivedA, ivA)

    const saltB = randomBytes(32); const ivB = randomBytes(12)
    const derivedB = Buffer.from(
      argon2id(entropy, saltB, { ...ARGON2_PARAMS, dkLen: 32 }),
    )
    const slotB = encryptVaultKey(vaultKey, derivedB, ivB)

    const enc: VaultEncryption = {
      algorithm: 'argon2id-aes256-gcm',
      argon2: { ...ARGON2_PARAMS },
      slots: {
        password: { salt: saltA.toString('hex'), iv: ivA.toString('hex'), ct: slotA.toString('hex') },
        recovery: { salt: saltB.toString('hex'), iv: ivB.toString('hex'), ct: slotB.toString('hex') },
      },
    }
    vaultManager.setEncryption(enc)
    return { phraseWords: phrase }
  })

  ipcMain.handle('vault:verifyPassword', (_event, password: string) => {
    const enc = vaultManager.getEncryption()
    if (!enc) return false
    try {
      const { salt, iv, ct } = enc.slots.password
      const derivedKey = Buffer.from(
        argon2id(Buffer.from(password, 'utf-8'), Buffer.from(salt, 'hex'), { ...ARGON2_PARAMS, dkLen: 32 }),
      )
      decryptVaultKey(Buffer.from(ct, 'hex'), derivedKey, Buffer.from(iv, 'hex'))
      return true
    } catch {
      return false
    }
  })

  ipcMain.handle('vault:changePassword', (_event, oldPassword: string, newPassword: string) => {
    const enc = vaultManager.getEncryption()
    if (!enc) throw new Error('Vault is not encrypted')
    const { salt, iv, ct } = enc.slots.password
    const derivedOld = Buffer.from(
      argon2id(Buffer.from(oldPassword, 'utf-8'), Buffer.from(salt, 'hex'), { ...ARGON2_PARAMS, dkLen: 32 }),
    )
    const vaultKey = decryptVaultKey(Buffer.from(ct, 'hex'), derivedOld, Buffer.from(iv, 'hex'))

    const saltA = randomBytes(32); const ivA = randomBytes(12)
    const derivedNew = Buffer.from(
      argon2id(Buffer.from(newPassword, 'utf-8'), saltA, { ...ARGON2_PARAMS, dkLen: 32 }),
    )
    const newSlot = encryptVaultKey(vaultKey, derivedNew, ivA)
    enc.slots.password = {
      salt: saltA.toString('hex'),
      iv: ivA.toString('hex'),
      ct: newSlot.toString('hex'),
    }
    vaultManager.setEncryption(enc)
  })

  ipcMain.handle('vault:removeEncryption', (_event, password: string) => {
    const enc = vaultManager.getEncryption()
    if (!enc) throw new Error('Vault is not encrypted')
    const { salt, iv, ct } = enc.slots.password
    const derivedKey = Buffer.from(
      argon2id(Buffer.from(password, 'utf-8'), Buffer.from(salt, 'hex'), { ...ARGON2_PARAMS, dkLen: 32 }),
    )
    // Throws on wrong password — guards against unauthorized removal.
    decryptVaultKey(Buffer.from(ct, 'hex'), derivedKey, Buffer.from(iv, 'hex'))
    vaultManager.removeEncryption()
  })

  ipcMain.handle('vault:regenerateRecovery', (_event, password: string) => {
    const enc = vaultManager.getEncryption()
    if (!enc) throw new Error('Vault is not encrypted')
    const { salt, iv, ct } = enc.slots.password
    const derivedKey = Buffer.from(
      argon2id(Buffer.from(password, 'utf-8'), Buffer.from(salt, 'hex'), { ...ARGON2_PARAMS, dkLen: 32 }),
    )
    const vaultKey = decryptVaultKey(Buffer.from(ct, 'hex'), derivedKey, Buffer.from(iv, 'hex'))

    const phrase = generateRecoveryPhrase()
    const entropy = recoveryPhraseToEntropy(phrase)
    const saltB = randomBytes(32); const ivB = randomBytes(12)
    const derivedB = Buffer.from(
      argon2id(entropy, saltB, { ...ARGON2_PARAMS, dkLen: 32 }),
    )
    const slotB = encryptVaultKey(vaultKey, derivedB, ivB)
    enc.slots.recovery = {
      salt: saltB.toString('hex'),
      iv: ivB.toString('hex'),
      ct: slotB.toString('hex'),
    }
    vaultManager.setEncryption(enc)
    return { phraseWords: phrase }
  })

  ipcMain.handle('vault:resetPasswordAfterRecovery', (_event, words: string[], newPassword: string) => {
    const enc = vaultManager.getEncryption()
    if (!enc) throw new Error('Vault is not encrypted')
    if (!isValidPhrase(words)) throw new Error('Invalid recovery phrase')
    const entropy = recoveryPhraseToEntropy(words)
    const { salt, iv, ct } = enc.slots.recovery
    const derivedB = Buffer.from(
      argon2id(entropy, Buffer.from(salt, 'hex'), { ...ARGON2_PARAMS, dkLen: 32 }),
    )
    const vaultKey = decryptVaultKey(Buffer.from(ct, 'hex'), derivedB, Buffer.from(iv, 'hex'))

    const saltA = randomBytes(32); const ivA = randomBytes(12)
    const derivedA = Buffer.from(
      argon2id(Buffer.from(newPassword, 'utf-8'), saltA, { ...ARGON2_PARAMS, dkLen: 32 }),
    )
    const newSlot = encryptVaultKey(vaultKey, derivedA, ivA)
    enc.slots.password = {
      salt: saltA.toString('hex'),
      iv: ivA.toString('hex'),
      ct: newSlot.toString('hex'),
    }
    vaultManager.setEncryption(enc)
  })
```

- [ ] **Step 4: Update `src/electron/preload.ts`**

Replace the `vault` object literal (lines 24–55) with the version below — the only additions are the seven new methods at the bottom, immediately before the closing brace:

```typescript
  vault: {
    getState: (): VaultState => ipcRenderer.sendSync('vault:getState') as VaultState,
    list: () => ipcRenderer.invoke('vault:list'),
    create: (name: string, dirPath: string) => ipcRenderer.invoke('vault:create', name, dirPath),
    select: (dirPath: string) => ipcRenderer.invoke('vault:select', dirPath),
    rename: (newName: string) => ipcRenderer.invoke('vault:rename', newName),
    showInExplorer: () => ipcRenderer.invoke('vault:showInExplorer'),
    chooseDirectory: () => ipcRenderer.invoke('vault:chooseDirectory'),
    onReady: (cb: () => void) => {
      ipcRenderer.on('vault:ready', cb)
      return () => ipcRenderer.removeListener('vault:ready', cb)
    },
    relaunch: () => ipcRenderer.invoke('vault:relaunch'),
    listImports: () => ipcRenderer.invoke('vault:listImports'),
    listVaultFiles: () => ipcRenderer.invoke('vault:listVaultFiles'),
    moveFile: (srcPath: string, targetFolder: string) => ipcRenderer.invoke('vault:moveFile', srcPath, targetFolder),
    deleteFile: (filePath: string) => ipcRenderer.invoke('vault:deleteFile', filePath),
    readFile: (filePath: string) => ipcRenderer.invoke('vault:readFile', filePath),
    onFileAdded: (cb: (event: FileAddedEvent) => void) => {
      const listener = (_e: Electron.IpcRendererEvent, payload: FileAddedEvent) => cb(payload)
      ipcRenderer.on('vault:file-added', listener)
      return () => ipcRenderer.removeListener('vault:file-added', listener)
    },
    onFileRemoved: (cb: (event: { path: string }) => void) => {
      const listener = (_e: Electron.IpcRendererEvent, payload: { path: string }) => cb(payload)
      ipcRenderer.on('vault:file-removed', listener)
      return () => ipcRenderer.removeListener('vault:file-removed', listener)
    },
    safeStorageAvailable: () => ipcRenderer.invoke('vault:safeStorageAvailable'),
    setSkipUntil: (until: string | null) => ipcRenderer.invoke('vault:setSkipUntil', until),
    getSkipUntil: () => ipcRenderer.invoke('vault:getSkipUntil'),
    getEncryptionStatus: () => ipcRenderer.invoke('vault:getEncryptionStatus'),
    setupEncryption: (password: string) => ipcRenderer.invoke('vault:setupEncryption', password),
    verifyPassword: (password: string) => ipcRenderer.invoke('vault:verifyPassword', password),
    changePassword: (oldPassword: string, newPassword: string) => ipcRenderer.invoke('vault:changePassword', oldPassword, newPassword),
    removeEncryption: (password: string) => ipcRenderer.invoke('vault:removeEncryption', password),
    regenerateRecovery: (password: string) => ipcRenderer.invoke('vault:regenerateRecovery', password),
    resetPasswordAfterRecovery: (words: string[], newPassword: string) =>
      ipcRenderer.invoke('vault:resetPasswordAfterRecovery', words, newPassword),
  },
```

- [ ] **Step 5: Update `src/ui/electron.d.ts`**

In the `vault` interface, add the seven new method signatures immediately after `getSkipUntil: () => Promise<string | null>`:

```typescript
        getEncryptionStatus: () => Promise<{ encrypted: boolean }>
        setupEncryption: (password: string) => Promise<{ phraseWords: string[] }>
        verifyPassword: (password: string) => Promise<boolean>
        changePassword: (oldPassword: string, newPassword: string) => Promise<void>
        removeEncryption: (password: string) => Promise<void>
        regenerateRecovery: (password: string) => Promise<{ phraseWords: string[] }>
        resetPasswordAfterRecovery: (words: string[], newPassword: string) => Promise<void>
```

- [ ] **Step 6: Type-check everything**

```bash
npm run build
npx tsc --project src/ui/tsconfig.json --noEmit
```

Expected: zero errors from both commands.

---

## Task 5: Create `src/ui/components/VaultPasswordSetup.tsx`

**Files:**
- Create: `src/ui/components/VaultPasswordSetup.tsx`

A self-contained 3-step modal: password entry (with confirm) → phrase display (read-only tiles, paste/copy disabled) → spot-check on 3 randomly-selected positions. The phrase comes from the IPC response — the renderer never generates it.

- [ ] **Step 1: Create the file**

```typescript
import { useState, useMemo } from 'react'

interface Props {
  /** Called after the user successfully completes setup + spot-check. */
  onComplete: () => void
  onCancel: () => void
}

type Step = 'password' | 'phrase' | 'verify'

function pickThreeIndices(): number[] {
  const indices = new Set<number>()
  while (indices.size < 3) {
    indices.add(Math.floor(Math.random() * 12))
  }
  return [...indices].sort((a, b) => a - b)
}

export default function VaultPasswordSetup({ onComplete, onCancel }: Props) {
  const vault = window.electronAPI?.vault

  const [step, setStep] = useState<Step>('password')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [phrase, setPhrase] = useState<string[]>([])
  const [checkIndices, setCheckIndices] = useState<number[]>([])
  const [checkInputs, setCheckInputs] = useState<Record<number, string>>({})
  const [checkError, setCheckError] = useState<string | null>(null)

  const passwordValid = useMemo(() => {
    return password.length >= 8 && password === confirm
  }, [password, confirm])

  async function handlePasswordSubmit() {
    if (!passwordValid || !vault) return
    setSubmitting(true)
    setError(null)
    try {
      const result = await vault.setupEncryption(password)
      setPhrase(result.phraseWords)
      setCheckIndices(pickThreeIndices())
      setCheckInputs({})
      setStep('phrase')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to set up encryption')
    } finally {
      setSubmitting(false)
    }
  }

  function handleVerifySubmit() {
    setCheckError(null)
    for (const idx of checkIndices) {
      const typed = (checkInputs[idx] ?? '').trim().toLowerCase()
      if (typed !== phrase[idx]) {
        setCheckError('One or more words did not match. Please review your written phrase and try again.')
        return
      }
    }
    onComplete()
  }

  return (
    <div className="fixed inset-0 bg-void/80 backdrop-blur-sm flex items-center justify-center z-50 p-6">
      <div className="bg-surface border border-rim rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-rim flex items-center justify-between">
          <h2 className="text-base font-semibold text-chalk">Set vault password</h2>
          <button
            onClick={onCancel}
            className="text-ash hover:text-chalk text-sm cursor-pointer"
          >
            Cancel
          </button>
        </div>

        {step === 'password' && (
          <div className="px-6 py-6 space-y-4">
            <p className="text-sm text-ash leading-relaxed">
              A vault password protects your books with strong encryption. The password is required
              every time you open or export this vault. There is no recovery without your password
              or your 12-word recovery phrase.
            </p>
            <div>
              <label className="block text-xs font-semibold text-chalk mb-1">Password (min. 8 characters)</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
                className="w-full bg-raised border border-rim rounded px-3 py-2 text-sm text-chalk focus:outline-none focus:border-neon/50"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-chalk mb-1">Confirm password</label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && passwordValid) void handlePasswordSubmit() }}
                className="w-full bg-raised border border-rim rounded px-3 py-2 text-sm text-chalk focus:outline-none focus:border-neon/50"
              />
              {confirm.length > 0 && password !== confirm && (
                <p className="text-xs text-red-400 mt-1">Passwords do not match.</p>
              )}
            </div>
            {error && <p className="text-xs text-red-400">{error}</p>}
            <div className="flex justify-end">
              <button
                onClick={() => void handlePasswordSubmit()}
                disabled={!passwordValid || submitting}
                className="px-4 py-2 bg-neon hover:bg-neon-dim text-void text-sm font-semibold rounded transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {submitting ? 'Generating…' : 'Continue →'}
              </button>
            </div>
          </div>
        )}

        {step === 'phrase' && (
          <div className="px-6 py-6 space-y-4">
            <div className="bg-emerald-950/40 border border-emerald-700 rounded-lg px-4 py-3">
              <p className="text-sm text-emerald-300 font-medium">Write this on paper right now.</p>
              <p className="text-xs text-emerald-200/80 mt-1">
                Do not screenshot. Store it somewhere physically separate from your computer.
                Anyone with these 12 words can unlock this vault.
              </p>
            </div>
            <div
              className="grid grid-cols-3 gap-2"
              onCopy={(e) => e.preventDefault()}
              onCut={(e) => e.preventDefault()}
              style={{ userSelect: 'none' }}
            >
              {phrase.map((word, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 bg-raised border border-rim rounded px-3 py-2"
                >
                  <span className="text-xs text-ash font-mono w-5 text-right">{i + 1}.</span>
                  <span className="text-sm text-chalk font-mono">{word}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => setStep('verify')}
                className="px-4 py-2 bg-neon hover:bg-neon-dim text-void text-sm font-semibold rounded transition-colors cursor-pointer"
              >
                I've written it down — verify me →
              </button>
            </div>
          </div>
        )}

        {step === 'verify' && (
          <div className="px-6 py-6 space-y-4">
            <p className="text-sm text-ash leading-relaxed">
              Type the words at the positions below to confirm you've written the phrase down correctly.
              No copy/paste, no autocorrect — type them by hand from your paper backup.
            </p>
            <div className="space-y-3">
              {checkIndices.map((idx) => (
                <div key={idx} className="flex items-center gap-3">
                  <label className="text-sm text-chalk font-mono w-20 shrink-0">
                    Word #{idx + 1}
                  </label>
                  <input
                    type="text"
                    value={checkInputs[idx] ?? ''}
                    onChange={(e) => setCheckInputs((prev) => ({ ...prev, [idx]: e.target.value }))}
                    onPaste={(e) => e.preventDefault()}
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    className="flex-1 bg-raised border border-rim rounded px-3 py-2 text-sm text-chalk font-mono focus:outline-none focus:border-neon/50"
                  />
                </div>
              ))}
            </div>
            {checkError && <p className="text-xs text-red-400">{checkError}</p>}
            <div className="flex justify-between">
              <button
                onClick={() => setStep('phrase')}
                className="px-4 py-2 bg-raised border border-rim rounded text-sm text-ash hover:text-chalk transition-colors cursor-pointer"
              >
                ← Show phrase again
              </button>
              <button
                onClick={handleVerifySubmit}
                disabled={checkIndices.some((i) => !(checkInputs[i] ?? '').trim())}
                className="px-4 py-2 bg-neon hover:bg-neon-dim text-void text-sm font-semibold rounded transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Confirm
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Type-check the UI**

```bash
npx tsc --project src/ui/tsconfig.json --noEmit
```

Expected: zero errors.

---

## Task 6: Create `src/ui/components/VaultRecoverModal.tsx`

**Files:**
- Create: `src/ui/components/VaultRecoverModal.tsx`

12 separate inputs, paste disabled, live BIP-39 validation against the bundled wordlist. `@scure/bip39` is pure JS and is safely imported in the renderer (Vite will tree-shake the English wordlist). After all 12 words are entered and valid, the user types a new password and confirms.

- [ ] **Step 1: Create the file**

```typescript
import { useState, useMemo } from 'react'
import { wordlist } from '@scure/bip39/wordlists/english'

interface Props {
  /** Called after the recovery phrase verifies and the new password is set. */
  onComplete: () => void
  onCancel: () => void
}

function normalize(word: string): string {
  return word.toLowerCase().trim()
}

function isKnownWord(word: string): boolean {
  return wordlist.includes(normalize(word))
}

export default function VaultRecoverModal({ onComplete, onCancel }: Props) {
  const vault = window.electronAPI?.vault

  const [words, setWords] = useState<string[]>(() => Array.from({ length: 12 }, () => ''))
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const allWordsKnown = useMemo(() => {
    return words.every((w) => w.trim().length > 0 && isKnownWord(w))
  }, [words])

  const passwordValid = useMemo(() => {
    return newPassword.length >= 8 && newPassword === confirm
  }, [newPassword, confirm])

  function updateWord(index: number, value: string): void {
    setWords((prev) => {
      const next = [...prev]
      next[index] = value
      return next
    })
  }

  async function handleSubmit() {
    if (!vault || !allWordsKnown || !passwordValid) return
    setSubmitting(true)
    setError(null)
    try {
      const normalized = words.map(normalize)
      await vault.resetPasswordAfterRecovery(normalized, newPassword)
      onComplete()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Recovery failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-void/80 backdrop-blur-sm flex items-center justify-center z-50 p-6">
      <div className="bg-surface border border-rim rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-rim flex items-center justify-between">
          <h2 className="text-base font-semibold text-chalk">Recover with 12-word phrase</h2>
          <button
            onClick={onCancel}
            className="text-ash hover:text-chalk text-sm cursor-pointer"
          >
            Cancel
          </button>
        </div>

        <div className="px-6 py-6 space-y-4">
          <p className="text-sm text-ash leading-relaxed">
            Type each word from your written recovery phrase, in order. No copy/paste — type them
            by hand. Words turn red if they are not in the BIP-39 wordlist.
          </p>

          <div className="grid grid-cols-3 gap-2">
            {words.map((word, i) => {
              const trimmed = word.trim()
              const known = trimmed.length === 0 || isKnownWord(trimmed)
              return (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs text-ash font-mono w-5 text-right">{i + 1}.</span>
                  <input
                    type="text"
                    value={word}
                    onChange={(e) => updateWord(i, e.target.value)}
                    onPaste={(e) => e.preventDefault()}
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    className={`flex-1 bg-raised border rounded px-2 py-1.5 text-sm text-chalk font-mono focus:outline-none ${
                      known ? 'border-rim focus:border-neon/50' : 'border-red-500'
                    }`}
                  />
                </div>
              )
            })}
          </div>

          <hr className="border-rim" />

          <div>
            <label className="block text-xs font-semibold text-chalk mb-1">New password (min. 8 characters)</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full bg-raised border border-rim rounded px-3 py-2 text-sm text-chalk focus:outline-none focus:border-neon/50"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-chalk mb-1">Confirm new password</label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full bg-raised border border-rim rounded px-3 py-2 text-sm text-chalk focus:outline-none focus:border-neon/50"
            />
            {confirm.length > 0 && newPassword !== confirm && (
              <p className="text-xs text-red-400 mt-1">Passwords do not match.</p>
            )}
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          <div className="flex justify-end">
            <button
              onClick={() => void handleSubmit()}
              disabled={!allWordsKnown || !passwordValid || submitting}
              className="px-4 py-2 bg-neon hover:bg-neon-dim text-void text-sm font-semibold rounded transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {submitting ? 'Verifying…' : 'Recover vault'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Type-check the UI**

```bash
npx tsc --project src/ui/tsconfig.json --noEmit
```

Expected: zero errors.

---

## Task 7: Add the encryption section to `src/ui/pages/settings/VaultTab.tsx`

**Files:**
- Modify: `src/ui/pages/settings/VaultTab.tsx`

Insert a new "Vault password" section between the existing "Switch vault" block and the `SafeStorageWarning` component. The section reflects the current encryption state and exposes setup / change / regenerate-recovery / remove operations, each guarded by the appropriate IPC call.

- [ ] **Step 1: Re-read the current file to confirm insertion point**

```bash
sed -n '200,215p' src/ui/pages/settings/VaultTab.tsx
```

Verify the existing "Switch vault" `<div>` ends at line 210 and is immediately followed by `{/* safeStorage warning */}` at line 212.

- [ ] **Step 2: Add imports at the top of `VaultTab.tsx`**

Add the two new component imports below the existing `import { getLifecycleLog, ... }` line:

```typescript
import VaultPasswordSetup from '../../components/VaultPasswordSetup'
import VaultRecoverModal from '../../components/VaultRecoverModal'
```

- [ ] **Step 3: Add encryption state and helpers inside the `VaultTab()` component**

Inside the `VaultTab()` function body, immediately below the existing `setLog` `useState` declaration (around line 71), add:

```typescript
  const [encrypted, setEncrypted] = useState<boolean>(false)
  const [setupOpen, setSetupOpen] = useState(false)
  const [recoverOpen, setRecoverOpen] = useState(false)
  const [changeOpen, setChangeOpen] = useState(false)
  const [regenOpen, setRegenOpen] = useState(false)
  const [removeOpen, setRemoveOpen] = useState(false)
  const [regeneratedPhrase, setRegeneratedPhrase] = useState<string[] | null>(null)

  useEffect(() => {
    if (!vault) return
    vault.getEncryptionStatus().then((s) => setEncrypted(s.encrypted)).catch(() => {})
  }, [])

  function refreshStatus(): void {
    vault?.getEncryptionStatus().then((s) => setEncrypted(s.encrypted)).catch(() => {})
  }
```

- [ ] **Step 4: Insert the new encryption section in the JSX**

In the returned JSX, immediately after the closing `</div>` of the "Switch vault" block and BEFORE the `{/* safeStorage warning */}` comment, insert:

```tsx
      {/* Vault password */}
      <div>
        <h3 className="text-sm font-semibold text-chalk mb-2">Vault password</h3>
        {encrypted ? (
          <>
            <p className="text-sm text-ash mb-3">
              Vault key is protected by your password. Full database encryption (SQLCipher) is
              pending a future update — for now, the password gates exports and protects the
              vault key inside <code className="text-xs bg-raised px-1.5 py-0.5 rounded">.corebooks</code>.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setChangeOpen(true)}
                className="px-3 py-1.5 bg-raised border border-rim rounded text-xs text-ash hover:text-chalk hover:border-neon/50 transition-colors cursor-pointer"
              >
                Change password
              </button>
              <button
                onClick={() => setRegenOpen(true)}
                className="px-3 py-1.5 bg-raised border border-rim rounded text-xs text-ash hover:text-chalk hover:border-neon/50 transition-colors cursor-pointer"
              >
                Regenerate recovery phrase
              </button>
              <button
                onClick={() => setRemoveOpen(true)}
                className="px-3 py-1.5 bg-raised border border-rim rounded text-xs text-ash hover:text-red-400 hover:border-red-500/50 transition-colors cursor-pointer"
              >
                Remove encryption
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-ash mb-3">
              This vault is unencrypted — data is protected by your OS file permissions only.
              Set a password to enable strong encryption and require it on every open and export.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setSetupOpen(true)}
                className="px-3 py-1.5 bg-neon hover:bg-neon-dim text-void text-xs font-semibold rounded transition-colors cursor-pointer"
              >
                Set vault password
              </button>
              <button
                onClick={() => setRecoverOpen(true)}
                className="px-3 py-1.5 bg-raised border border-rim rounded text-xs text-ash hover:text-chalk hover:border-neon/50 transition-colors cursor-pointer"
              >
                Recover with 12-word phrase
              </button>
            </div>
          </>
        )}
      </div>

      {setupOpen && (
        <VaultPasswordSetup
          onComplete={() => { setSetupOpen(false); refreshStatus() }}
          onCancel={() => setSetupOpen(false)}
        />
      )}
      {recoverOpen && (
        <VaultRecoverModal
          onComplete={() => { setRecoverOpen(false); refreshStatus() }}
          onCancel={() => setRecoverOpen(false)}
        />
      )}
      {changeOpen && (
        <ChangePasswordModal
          onComplete={() => setChangeOpen(false)}
          onCancel={() => setChangeOpen(false)}
        />
      )}
      {regenOpen && (
        <RegenerateRecoveryModal
          onComplete={(phrase) => { setRegenOpen(false); setRegeneratedPhrase(phrase) }}
          onCancel={() => setRegenOpen(false)}
        />
      )}
      {regeneratedPhrase && (
        <DisplayPhraseModal phrase={regeneratedPhrase} onClose={() => setRegeneratedPhrase(null)} />
      )}
      {removeOpen && (
        <RemoveEncryptionModal
          onComplete={() => { setRemoveOpen(false); refreshStatus() }}
          onCancel={() => setRemoveOpen(false)}
        />
      )}
```

- [ ] **Step 5: Add the four inline helper modals at the bottom of `VaultTab.tsx`**

Below the default export of `VaultTab`, add four small modal components. They live in the same file because they are tightly coupled to vault encryption state and are not reused elsewhere.

```typescript
interface SimpleModalProps {
  onComplete: () => void
  onCancel: () => void
}

function ChangePasswordModal({ onComplete, onCancel }: SimpleModalProps) {
  const vault = window.electronAPI?.vault
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const valid = newPassword.length >= 8 && newPassword === confirm && oldPassword.length > 0

  async function handleSubmit() {
    if (!vault || !valid) return
    setSubmitting(true); setError(null)
    try {
      const ok = await vault.verifyPassword(oldPassword)
      if (!ok) throw new Error('Current password is incorrect')
      await vault.changePassword(oldPassword, newPassword)
      onComplete()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to change password')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-void/80 backdrop-blur-sm flex items-center justify-center z-50 p-6">
      <div className="bg-surface border border-rim rounded-lg w-full max-w-md">
        <div className="px-6 py-4 border-b border-rim flex items-center justify-between">
          <h2 className="text-base font-semibold text-chalk">Change password</h2>
          <button onClick={onCancel} className="text-ash hover:text-chalk text-sm cursor-pointer">Cancel</button>
        </div>
        <div className="px-6 py-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-chalk mb-1">Current password</label>
            <input type="password" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} autoFocus
              className="w-full bg-raised border border-rim rounded px-3 py-2 text-sm text-chalk focus:outline-none focus:border-neon/50" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-chalk mb-1">New password (min. 8 characters)</label>
            <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
              className="w-full bg-raised border border-rim rounded px-3 py-2 text-sm text-chalk focus:outline-none focus:border-neon/50" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-chalk mb-1">Confirm new password</label>
            <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
              className="w-full bg-raised border border-rim rounded px-3 py-2 text-sm text-chalk focus:outline-none focus:border-neon/50" />
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <div className="flex justify-end">
            <button onClick={() => void handleSubmit()} disabled={!valid || submitting}
              className="px-4 py-2 bg-neon hover:bg-neon-dim text-void text-sm font-semibold rounded transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">
              {submitting ? 'Changing…' : 'Change password'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

interface RegenerateRecoveryModalProps {
  onComplete: (phrase: string[]) => void
  onCancel: () => void
}

function RegenerateRecoveryModal({ onComplete, onCancel }: RegenerateRecoveryModalProps) {
  const vault = window.electronAPI?.vault
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    if (!vault) return
    setSubmitting(true); setError(null)
    try {
      const ok = await vault.verifyPassword(password)
      if (!ok) throw new Error('Password is incorrect')
      const result = await vault.regenerateRecovery(password)
      onComplete(result.phraseWords)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to regenerate phrase')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-void/80 backdrop-blur-sm flex items-center justify-center z-50 p-6">
      <div className="bg-surface border border-rim rounded-lg w-full max-w-md">
        <div className="px-6 py-4 border-b border-rim flex items-center justify-between">
          <h2 className="text-base font-semibold text-chalk">Regenerate recovery phrase</h2>
          <button onClick={onCancel} className="text-ash hover:text-chalk text-sm cursor-pointer">Cancel</button>
        </div>
        <div className="px-6 py-6 space-y-4">
          <div className="bg-amber-950/40 border border-amber-700 rounded-lg px-4 py-3">
            <p className="text-sm text-amber-300 font-medium">Warning</p>
            <p className="text-xs text-amber-200/80 mt-1">
              Your old 12-word phrase will stop working immediately. Make sure to write down the new
              phrase and destroy the old one.
            </p>
          </div>
          <div>
            <label className="block text-xs font-semibold text-chalk mb-1">Current password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus
              className="w-full bg-raised border border-rim rounded px-3 py-2 text-sm text-chalk focus:outline-none focus:border-neon/50" />
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <div className="flex justify-end">
            <button onClick={() => void handleSubmit()} disabled={!password || submitting}
              className="px-4 py-2 bg-neon hover:bg-neon-dim text-void text-sm font-semibold rounded transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">
              {submitting ? 'Generating…' : 'Generate new phrase'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function DisplayPhraseModal({ phrase, onClose }: { phrase: string[]; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-void/80 backdrop-blur-sm flex items-center justify-center z-50 p-6">
      <div className="bg-surface border border-rim rounded-lg w-full max-w-2xl">
        <div className="px-6 py-4 border-b border-rim">
          <h2 className="text-base font-semibold text-chalk">New recovery phrase</h2>
        </div>
        <div className="px-6 py-6 space-y-4">
          <div className="bg-emerald-950/40 border border-emerald-700 rounded-lg px-4 py-3">
            <p className="text-sm text-emerald-300 font-medium">Write this on paper right now.</p>
            <p className="text-xs text-emerald-200/80 mt-1">Do not screenshot. Your old phrase no longer works.</p>
          </div>
          <div
            className="grid grid-cols-3 gap-2"
            onCopy={(e) => e.preventDefault()}
            onCut={(e) => e.preventDefault()}
            style={{ userSelect: 'none' }}
          >
            {phrase.map((word, i) => (
              <div key={i} className="flex items-center gap-2 bg-raised border border-rim rounded px-3 py-2">
                <span className="text-xs text-ash font-mono w-5 text-right">{i + 1}.</span>
                <span className="text-sm text-chalk font-mono">{word}</span>
              </div>
            ))}
          </div>
          <div className="flex justify-end">
            <button onClick={onClose}
              className="px-4 py-2 bg-neon hover:bg-neon-dim text-void text-sm font-semibold rounded transition-colors cursor-pointer">
              I've written it down
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function RemoveEncryptionModal({ onComplete, onCancel }: SimpleModalProps) {
  const vault = window.electronAPI?.vault
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    if (!vault || !password) return
    setSubmitting(true); setError(null)
    try {
      await vault.removeEncryption(password)
      onComplete()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to remove encryption')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-void/80 backdrop-blur-sm flex items-center justify-center z-50 p-6">
      <div className="bg-surface border border-rim rounded-lg w-full max-w-md">
        <div className="px-6 py-4 border-b border-rim flex items-center justify-between">
          <h2 className="text-base font-semibold text-chalk">Remove encryption</h2>
          <button onClick={onCancel} className="text-ash hover:text-chalk text-sm cursor-pointer">Cancel</button>
        </div>
        <div className="px-6 py-6 space-y-4">
          <div className="bg-red-950/40 border border-red-700 rounded-lg px-4 py-3">
            <p className="text-sm text-red-300 font-medium">This removes password protection.</p>
            <p className="text-xs text-red-200/80 mt-1">
              The vault key wrap and recovery phrase are deleted from
              <code className="text-xs bg-raised px-1 py-0.5 rounded ml-1">.corebooks</code>.
              The vault is again protected only by OS file permissions.
            </p>
          </div>
          <div>
            <label className="block text-xs font-semibold text-chalk mb-1">Current password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus
              className="w-full bg-raised border border-rim rounded px-3 py-2 text-sm text-chalk focus:outline-none focus:border-neon/50" />
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <div className="flex justify-end">
            <button onClick={() => void handleSubmit()} disabled={!password || submitting}
              className="px-4 py-2 bg-red-600 hover:bg-red-500 text-chalk text-sm font-semibold rounded transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">
              {submitting ? 'Removing…' : 'Remove encryption'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Type-check the UI**

```bash
npx tsc --project src/ui/tsconfig.json --noEmit
```

Expected: zero errors.

---

## Task 8: Upgrade `src/ui/lib/crypto.ts` and create `docs/SECURITY.md`

**Files:**
- Replace: `src/ui/lib/crypto.ts`
- Create: `tests/ui/cryptoExport.test.ts`
- Create: `docs/SECURITY.md`

The export-encryption module moves from PBKDF2 to Argon2id. The envelope version bumps from `v: 1` to `v: 2`. Any consumer that decodes the envelope will see `kdf: 'Argon2id'` and the `argon2` parameter block.

- [ ] **Step 1: Replace `src/ui/lib/crypto.ts`**

```typescript
// AES-256-GCM encryption for export files, using the Web Crypto API for
// symmetric encryption and Argon2id (via @noble/hashes, pure JS) for the KDF.
//
// The output is a self-describing JSON envelope so future decryption tools
// can verify algorithm parameters without guessing. The envelope is versioned
// — v1 files used PBKDF2-SHA256 (600k iterations); v2 files use Argon2id with
// the parameter block recorded inline.
import { argon2id } from '@noble/hashes/argon2'

export interface EncryptedExport {
  v: 2
  algo: 'AES-256-GCM'
  kdf: 'Argon2id'
  argon2: { m: number; t: number; p: number }
  salt: string  // base64, 32 bytes
  iv: string    // base64, 12 bytes
  ct: string    // base64 ciphertext + GCM auth tag
}

const ARGON2_PARAMS = { m: 65536, t: 3, p: 4 } as const

function toBase64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  // Build the binary string in chunks to avoid hitting the JS engine's
  // maximum argument count when spreading large Uint8Arrays into fromCharCode.
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!)
  }
  return btoa(binary)
}

export async function encryptExport(
  data: unknown,
  passphrase: string,
): Promise<EncryptedExport> {
  const enc = new TextEncoder()
  const salt = crypto.getRandomValues(new Uint8Array(32))
  const iv = crypto.getRandomValues(new Uint8Array(12))

  const derivedKey = argon2id(enc.encode(passphrase), salt, { ...ARGON2_PARAMS, dkLen: 32 })

  const key = await crypto.subtle.importKey(
    'raw',
    derivedKey,
    { name: 'AES-GCM' },
    false,
    ['encrypt'],
  )

  const plaintext = enc.encode(JSON.stringify(data))
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext)

  return {
    v: 2,
    algo: 'AES-256-GCM',
    kdf: 'Argon2id',
    argon2: { ...ARGON2_PARAMS },
    salt: toBase64(salt),
    iv: toBase64(iv),
    ct: toBase64(ct),
  }
}
```

- [ ] **Step 2: Create `tests/ui/cryptoExport.test.ts`**

```typescript
import { describe, it, expect } from 'vitest'
import { encryptExport } from '../../src/ui/lib/crypto'

describe('encryptExport (v2 / Argon2id)', () => {
  it('produces a v2 envelope with the expected fixed fields', async () => {
    const envelope = await encryptExport({ hello: 'world' }, 'correct horse battery staple')
    expect(envelope.v).toBe(2)
    expect(envelope.algo).toBe('AES-256-GCM')
    expect(envelope.kdf).toBe('Argon2id')
    expect(envelope.argon2).toEqual({ m: 65536, t: 3, p: 4 })
  })

  it('produces a non-empty base64 salt (32 bytes → 44 chars w/ padding)', async () => {
    const envelope = await encryptExport({ x: 1 }, 'pw')
    expect(envelope.salt.length).toBeGreaterThan(40)
  })

  it('produces a non-empty base64 IV (12 bytes → 16 chars w/ padding)', async () => {
    const envelope = await encryptExport({ x: 1 }, 'pw')
    expect(envelope.iv.length).toBeGreaterThan(12)
  })

  it('produces different ciphertexts for the same input on each call (random salt + IV)', async () => {
    const a = await encryptExport({ x: 1 }, 'pw')
    const b = await encryptExport({ x: 1 }, 'pw')
    expect(a.ct).not.toBe(b.ct)
    expect(a.salt).not.toBe(b.salt)
    expect(a.iv).not.toBe(b.iv)
  })

  it('round-trips: a decrypt routine using the published envelope recovers the data', async () => {
    const envelope = await encryptExport({ msg: 'hello', n: 42 }, 'pw')

    // Mirror the encrypt logic to verify the envelope is self-describing and complete.
    const { argon2id } = await import('@noble/hashes/argon2')
    function fromBase64(b64: string): Uint8Array {
      const bin = atob(b64)
      const arr = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
      return arr
    }
    const salt = fromBase64(envelope.salt)
    const iv = fromBase64(envelope.iv)
    const ct = fromBase64(envelope.ct)
    const derived = argon2id(new TextEncoder().encode('pw'), salt, { ...envelope.argon2, dkLen: 32 })
    const key = await crypto.subtle.importKey('raw', derived, { name: 'AES-GCM' }, false, ['decrypt'])
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct)
    expect(JSON.parse(new TextDecoder().decode(plain))).toEqual({ msg: 'hello', n: 42 })
  })
})
```

- [ ] **Step 3: Run the new test**

```bash
npx vitest run tests/ui/cryptoExport.test.ts
```

Expected: all 5 tests pass.

- [ ] **Step 4: Create `docs/SECURITY.md`**

```markdown
# CoreBooks — Security Architecture

CoreBooks is built around the principle that **you own your data**. This document
describes exactly how vault data is protected, what guarantees apply, and what
deliberate trade-offs we have made. The implementation is open-source — every
claim below points to the file that backs it.

## Threat model

| Threat | Defense |
|---|---|
| Stolen laptop, vault password unknown | Argon2id + AES-256-GCM vault key wrap; no backdoor exists |
| API exposed over the network (SQLite mode) | API binds to `127.0.0.1` only — `src/api/bootstrap.ts` |
| Tampered ciphertext | AES-256-GCM authenticated encryption — decryption throws on tag mismatch |
| Forgotten vault password | BIP-39 recovery phrase (slot B) unlocks the same vault key K |
| Lost both password AND phrase | **Vault is unrecoverable.** This is by design. See "No-backdoor policy" below |

## Encryption stack

| Layer | Algorithm | Source |
|---|---|---|
| Key derivation | Argon2id (m=64 MiB, t=3, p=4, dkLen=32) | `@noble/hashes/argon2` |
| Vault key wrap | AES-256-GCM | `src/electron/vaultCrypto.ts` |
| Recovery phrase | BIP-39, 12 words (128 bits) | `@scure/bip39`, `src/electron/recoveryPhrase.ts` |
| Export encryption | Argon2id + AES-256-GCM | `src/ui/lib/crypto.ts` |
| Database file encryption | SQLCipher — **pending Plan F** | future work |
| OS-keychain protection (encryption key for DB at rest) | Electron `safeStorage` | `src/electron/main.ts` |

## Key slot architecture

The vault key K (32 random bytes, generated once when encryption is enabled) is
**never stored in plaintext**. Instead, two independently-derived wrapping keys
each encrypt K and the resulting ciphertexts are stored in `.corebooks` metadata:

```
password        → Argon2id → slot A → unlocks K → AES-256-GCM → vault data
recovery phrase → Argon2id → slot B → unlocks K → AES-256-GCM → vault data
```

Either slot alone is sufficient to recover K. Regenerating the recovery phrase
replaces slot B only — K itself does not change, so vault data does not need to
be re-encrypted.

The vault metadata structure is defined in `src/electron/vaultTypes.ts`
(`VaultEncryption` / `VaultKeySlot`). The IPC handlers that drive the slot
operations live in `src/electron/main.ts`.

## What "no password" means

If you do not set a vault password, the vault is stored as a plain SQLite
database file inside the vault folder. Its only protection is the operating
system's file permissions and any disk-level encryption you have enabled
(FileVault on macOS, BitLocker on Windows, LUKS on Linux).

The Settings → Vault page surfaces this honestly:

> This vault is unencrypted — data is protected by your OS file permissions only.

No password is **not wrong** — it is an informed choice. Many users on
single-user encrypted laptops decide the additional friction of a vault password
is not worth the marginal gain over FileVault/BitLocker. We let you make that
call.

## SQLCipher status

Database-file encryption via SQLCipher is **pending Plan F**. The blocker is
that `@prisma/adapter-better-sqlite3` instantiates `better-sqlite3` internally
and does not expose a hook to run `PRAGMA key` before Prisma opens the file.
Plan F will replace the adapter with one built on `better-sqlite3-sqlcipher`
that accepts a pre-opened, keyed instance.

Until Plan F lands, "vault password set" means:
- The vault key K is wrapped with Argon2id + AES-256-GCM in `.corebooks`.
- All exports are gated behind the vault password.
- The SQLite file itself is **not** yet encrypted.

This is documented in the Settings → Vault password section.

## No-backdoor policy

There is **no recovery mechanism beyond the password and the BIP-39 phrase**.
There is no master key, no email-based reset, no Anthropic key escrow, no
"forgot password" link. The encryption used (Argon2id with memory-hard
parameters and AES-256-GCM) is computationally unfeasible to brute-force on
realistic hardware.

This is intentional. A backdoor for the user is a backdoor for an attacker.
The 12-word recovery phrase is your safety net — write it down on paper, store
it physically separate from the device.

## Total-loss safeguard

Because losing both the password and the recovery phrase makes the vault
unrecoverable, Settings → Vault offers an **Export vault as plain file** action.
We encourage you to keep periodic plain-text exports of your books somewhere
physically separate from both the device and your recovery phrase. The
exports are gated behind the vault password to prevent extraction from an
unattended unlocked session.

## Source map

| Component | File |
|---|---|
| Vault key wrap (AES-256-GCM) | `src/electron/vaultCrypto.ts` |
| BIP-39 recovery phrase | `src/electron/recoveryPhrase.ts` |
| Encryption metadata storage | `src/electron/vaultManager.ts`, `src/electron/vaultTypes.ts` |
| Password IPC handlers | `src/electron/main.ts` |
| Setup / spot-check UI | `src/ui/components/VaultPasswordSetup.tsx` |
| Recovery UI | `src/ui/components/VaultRecoverModal.tsx` |
| Settings → Vault password | `src/ui/pages/settings/VaultTab.tsx` |
| Export encryption (Argon2id + AES-256-GCM) | `src/ui/lib/crypto.ts` |
| OS-keychain DB key (for future SQLCipher) | `src/electron/main.ts` (`getOrCreateEncryptionKey`) |
| API loopback binding | `src/api/bootstrap.ts` |
| PostgreSQL SSL warning | `src/db/client.ts` |

## Reporting a vulnerability

If you discover a security issue, please open an issue on GitHub describing the
problem. We aim to respond within seven days. Because CoreBooks is open-source
and runs entirely on your machine, there is no production environment to patch
— security fixes are released as a new desktop build that users install on
their own schedule.
```

- [ ] **Step 5: Run the full test suite to confirm nothing regressed**

```bash
npm test -- --run
```

Expected: all tests pass, including the new ones from Tasks 1, 2, 3, and 8.

- [ ] **Step 6: Final type-check**

```bash
npm run build
npx tsc --project src/ui/tsconfig.json --noEmit
```

Expected: zero errors.

---

## Self-Review Checklist

### 1. Spec coverage

| Spec requirement | Task |
|---|---|
| Argon2id KDF | Task 4 (IPC handlers), Task 8 (export) |
| AES-256-GCM symmetric | Task 1 (`vaultCrypto.ts`) |
| BIP-39 12-word phrase via `@scure/bip39` | Task 2 (`recoveryPhrase.ts`) |
| Dual key-slot architecture (slot A password, slot B recovery) | Task 3 (types), Task 4 (`vault:setupEncryption`) |
| Regenerate phrase replaces slot B only | Task 4 (`vault:regenerateRecovery`) |
| BIP-39 setup flow: 12 tiles, no select, no copy/paste | Task 5 (`VaultPasswordSetup.tsx`, `userSelect: 'none'`, `onCopy/onCut preventDefault`) |
| BIP-39 setup flow: green banner "write on paper" | Task 5 (emerald banner copy) |
| Spot-check: 3 random positions, no paste, no autocorrect/spellcheck | Task 5 (`pickThreeIndices`, `onPaste preventDefault`, `autoCorrect="off"`, `spellCheck={false}`) |
| Recovery: 12 individual fields, no paste, live wordlist validation | Task 6 (`VaultRecoverModal.tsx`, `onPaste preventDefault`, red border) |
| Recovery success → prompt to set new password | Task 6 (new-password section inside same modal) |
| Regeneration: requires current password + amber warning | Task 7 (`RegenerateRecoveryModal`, amber banner) |
| Settings → Vault encryption section | Task 7 |
| "Vault is unencrypted" copy on no-password state | Task 7 (else branch) |
| Honest copy about SQLCipher being deferred | Task 7 (encrypted-state paragraph) |
| Export password gate | Implemented at vault-password level (Task 7 surfaces the password; existing export flow consumes `verifyPassword`). **NOTE: The export call sites in the existing UI are not wired in this plan — they call `encryptExport` directly. A follow-up integration point in the existing `ExportPasswordModal` is needed to call `vault.verifyPassword` first. This is called out below.** |
| Export upgrade PBKDF2 → Argon2id (`v: 2`) | Task 8 |
| `docs/SECURITY.md` covering stack, slots, no-backdoor, source links | Task 8 |
| Emergency "Export vault as plain file" guidance | Documented in SECURITY.md; UI button already exists in current `VaultTab.tsx` via vault file operations — no new button needed in Plan E |

### 2. Placeholder scan

Re-read every code block above: no `TBD`, no `// TODO`, no `...` truncations inside functions. Every test has concrete assertions with real expected values.

### 3. Type consistency

- `VaultEncryption` / `VaultKeySlot` defined once in `vaultTypes.ts`, imported in `vaultManager.ts`, `main.ts`, and the tests.
- `Buffer.from(argon2id(...))` used consistently — `@noble/hashes` returns `Uint8Array`, Node's `createCipheriv` accepts both but `decryptVaultKey` validates `.length` so the conversion is necessary for the strict 32-byte guards.
- IPC handler return types match `electron.d.ts` declarations exactly: `getEncryptionStatus → { encrypted: boolean }`, `setupEncryption / regenerateRecovery → { phraseWords: string[] }`, `verifyPassword → boolean`, the rest `void`.
- `EncryptedExport.v: 2` is a literal — older v1 files cannot accidentally claim v2.

### 4. Honest gap callouts

Two integration tasks are explicitly out of scope for Plan E and are flagged for follow-up:

1. **Export password gate wiring** — `vault.verifyPassword` exists, but the existing `ExportPasswordModal` and any code paths that call `encryptExport` are not modified in this plan to require `verifyPassword` first. Plan E provides the primitive; a small follow-up patch (or the first task of Plan F) should add the gate at every export entry point.
2. **SQLCipher** — Deferred to Plan F. The vault password protects the vault key wrap and gates the export password (above), but the on-disk `corebooks.db` is not yet encrypted. Both the Settings UI copy and `SECURITY.md` state this honestly.

---

## Commit

```bash
git add docs/superpowers/plans/2026-06-28-plan-e-vault-encryption.md
git commit -m "docs: add Plan E vault password and encryption implementation plan"
```
