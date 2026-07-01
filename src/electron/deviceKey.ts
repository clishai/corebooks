import fs from 'node:fs'
import path from 'node:path'
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto'

export function getOrCreateDeviceKey(userData: string): Buffer {
  const keyPath = path.join(userData, 'device.key')
  if (fs.existsSync(keyPath)) {
    return fs.readFileSync(keyPath)
  }
  const key = randomBytes(32)
  fs.writeFileSync(keyPath, key, { mode: 0o600 })
  return key
}

export function encryptWithDeviceKey(plain: Buffer, deviceKey: Buffer): Buffer {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', deviceKey, iv)
  const ct = Buffer.concat([cipher.update(plain), cipher.final()])
  const tag = cipher.getAuthTag()
  // Layout: iv(12) || tag(16) || ciphertext
  return Buffer.concat([iv, tag, ct])
}

export function decryptWithDeviceKey(blob: Buffer, deviceKey: Buffer): Buffer {
  const iv = blob.subarray(0, 12)
  const tag = blob.subarray(12, 28)
  const ct = blob.subarray(28)
  const decipher = createDecipheriv('aes-256-gcm', deviceKey, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ct), decipher.final()])
}
