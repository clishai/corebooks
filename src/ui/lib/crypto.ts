// AES-256-GCM encryption for export files, using the Web Crypto API.
// Key derivation: PBKDF2-SHA256, 600 000 iterations — matches OWASP 2023 guidance.
// The output is a self-describing JSON envelope so future decryption tools
// can verify algorithm parameters without guessing.

export interface EncryptedExport {
  v: 1
  algo: 'AES-256-GCM'
  kdf: 'PBKDF2'
  hash: 'SHA-256'
  iter: number
  salt: string  // base64
  iv: string    // base64
  ct: string    // base64 ciphertext + GCM auth tag
}

const PBKDF2_ITERATIONS = 600_000

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

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  )

  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, hash: 'SHA-256', iterations: PBKDF2_ITERATIONS },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt'],
  )

  const plaintext = enc.encode(JSON.stringify(data))
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext)

  return {
    v: 1,
    algo: 'AES-256-GCM',
    kdf: 'PBKDF2',
    hash: 'SHA-256',
    iter: PBKDF2_ITERATIONS,
    salt: toBase64(salt),
    iv: toBase64(iv),
    ct: toBase64(ct),
  }
}
