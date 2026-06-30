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
