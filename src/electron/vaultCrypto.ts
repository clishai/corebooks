import { createCipheriv, createDecipheriv } from 'crypto'

const GCM_TAG_BYTES = 16

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
