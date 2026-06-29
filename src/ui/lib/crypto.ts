// AES-256-GCM encryption for export files, using the Web Crypto API for
// symmetric encryption and Argon2id (via @noble/hashes, pure JS) for the KDF.
//
// The output is a self-describing JSON envelope so future decryption tools
// can verify algorithm parameters without guessing. The envelope is versioned
// — v1 files used PBKDF2-SHA256 (600k iterations); v2 files use Argon2id with
// the parameter block recorded inline.
import { argon2id } from '@noble/hashes/argon2.js'

export interface EncryptedExport {
  v: 2
  algo: 'AES-256-GCM'
  kdf: 'Argon2id'
  argon2: { m: number; t: number; p: number }
  salt: string  // base64, 32 bytes
  iv: string    // base64, 12 bytes
  ct: string    // base64, ciphertext + 16-byte GCM tag
}

const ARGON2_PARAMS = { m: 65536, t: 3, p: 4 } as const

function b64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  return btoa(String.fromCharCode(...bytes))
}

function unb64(s: string): Uint8Array<ArrayBuffer> {
  // Uint8Array.from returns Uint8Array<ArrayBufferLike>; slice() returns a
  // Uint8Array<ArrayBuffer>, which satisfies the Web Crypto BufferSource type.
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0)).slice()
}

export async function encryptExport(plaintext: string, password: string): Promise<EncryptedExport> {
  const salt = crypto.getRandomValues(new Uint8Array(32))
  const iv = crypto.getRandomValues(new Uint8Array(12))

  // argon2id returns a Uint8Array whose underlying ArrayBuffer may be shared
  // (ArrayBufferLike). Copy into a fresh Uint8Array with an owned ArrayBuffer
  // so Web Crypto importKey receives a concrete ArrayBuffer.
  const rawKeyBytes = argon2id(
    new TextEncoder().encode(password),
    salt,
    { ...ARGON2_PARAMS, dkLen: 32 },
  )
  const keyBytes = new Uint8Array(rawKeyBytes)

  const cryptoKey = await crypto.subtle.importKey(
    'raw', keyBytes, { name: 'AES-GCM' }, false, ['encrypt'],
  )

  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    cryptoKey,
    new TextEncoder().encode(plaintext),
  )

  return {
    v: 2,
    algo: 'AES-256-GCM',
    kdf: 'Argon2id',
    argon2: { ...ARGON2_PARAMS },
    salt: b64(salt),
    iv: b64(iv),
    ct: b64(ct),
  }
}

export async function decryptExport(envelope: EncryptedExport, password: string): Promise<string> {
  const salt = unb64(envelope.salt)
  const iv = unb64(envelope.iv)
  const ct = unb64(envelope.ct)
  const params = envelope.argon2 ?? ARGON2_PARAMS

  const rawKeyBytes = argon2id(
    new TextEncoder().encode(password),
    salt,
    { m: params.m, t: params.t, p: params.p, dkLen: 32 },
  )
  const keyBytes = new Uint8Array(rawKeyBytes)

  const cryptoKey = await crypto.subtle.importKey(
    'raw', keyBytes, { name: 'AES-GCM' }, false, ['decrypt'],
  )

  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    cryptoKey,
    ct,
  )

  return new TextDecoder().decode(plain)
}
