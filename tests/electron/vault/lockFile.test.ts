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
    const lock = createLockFile(id, K, 'pw-pw-pw-pw-pw', entropy)
    const unlocked = unlockWithRecovery(lock, id, entropy)
    expect(unlocked.equals(K)).toBe(true)
  })

  // Spec T3
  it('verifyHmac fails when any byte of lock data is flipped', () => {
    const id = generateVaultId()
    const lock = createLockFile(id, randomBytes(32), 'pw-pw-pw-pw-pw', randomBytes(16))
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
    const lock = createLockFile(idA, randomBytes(32), 'pw-pw-pw-pw-pw', randomBytes(16))
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
