import type { VaultId } from './types.js'

export interface BiometricBackend {
  isEncryptionAvailable(): boolean
  encryptString(plain: string): Buffer
  decryptString(encrypted: Buffer): string
  put(label: string, value: Buffer): void
  get(label: string): Buffer | null
  remove(label: string): void
}

export interface BiometricStore {
  isBiometricAvailable(): boolean
  storeBiometricKey(vaultId: VaultId, K: Buffer): void
  /**
   * Returns null if biometric encryption is unavailable OR if no key has been
   * stored for this vault. Call isBiometricAvailable() first to distinguish
   * the two cases before falling back to password unlock.
   */
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
  // 'FAKE:' prefix cannot appear in hex-encoded key material ([0-9a-f] only).
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
