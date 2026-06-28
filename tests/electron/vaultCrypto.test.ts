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
