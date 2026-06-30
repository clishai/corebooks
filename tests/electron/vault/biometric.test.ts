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
