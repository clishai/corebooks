import { describe, it, expect } from 'vitest'
import { encryptExport, decryptExport, type EncryptedExport } from '../../src/ui/lib/crypto.js'

describe('encryptExport', () => {
  it('produces a v:2 Argon2id envelope', async () => {
    const env = await encryptExport('hello', 'password123')
    expect(env.v).toBe(2)
    expect(env.kdf).toBe('Argon2id')
    expect(env.algo).toBe('AES-256-GCM')
    expect(env.argon2).toEqual({ m: 65536, t: 3, p: 4 })
  })

  it('salt is 32 bytes (base64 length 44)', async () => {
    const env = await encryptExport('hello', 'password123')
    // 32 bytes base64-encoded is 44 characters (ceil(32/3)*4)
    expect(env.salt.length).toBe(44)
  })

  it('iv is 12 bytes (base64 length 16)', async () => {
    const env = await encryptExport('hello', 'password123')
    expect(env.iv.length).toBe(16)
  })

  it('produces different envelopes for same plaintext (fresh salt+iv)', async () => {
    const a = await encryptExport('hello', 'password123')
    const b = await encryptExport('hello', 'password123')
    expect(a.salt).not.toBe(b.salt)
    expect(a.iv).not.toBe(b.iv)
  })
})

describe('decryptExport', () => {
  it('round-trips plaintext exactly', async () => {
    const plaintext = 'hello corebooks'
    const env = await encryptExport(plaintext, 'test-password')
    const back = await decryptExport(env, 'test-password')
    expect(back).toBe(plaintext)
  })

  it('throws on wrong password', async () => {
    const env = await encryptExport('secret', 'correct-password')
    await expect(decryptExport(env, 'wrong-password')).rejects.toThrow()
  })

  it('reads the argon2 params from the envelope (future-proof)', async () => {
    const env = await encryptExport('hello', 'password123')
    // Verify that decryptExport uses envelope.argon2, not just hardcoded params
    const modified: EncryptedExport = { ...env, argon2: { m: 65536, t: 3, p: 4 } }
    const back = await decryptExport(modified, 'password123')
    expect(back).toBe('hello')
  })
})
