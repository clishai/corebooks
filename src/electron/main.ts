import { app, BrowserWindow, ipcMain, shell, dialog, safeStorage } from 'electron'
import { createServer } from 'net'
import { randomBytes } from 'crypto'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { argon2id } from '@noble/hashes/argon2.js'
import { VaultManager } from './vaultManager.js'
import { VaultWatcher } from './vaultWatcher.js'
import { encryptVaultKey, decryptVaultKey } from './vaultCrypto.js'
import {
  generateRecoveryPhrase,
  recoveryPhraseToEntropy,
  isValidPhrase,
} from './recoveryPhrase.js'
import type { VaultEncryption, VaultState } from './vaultTypes.js'

const ARGON2_PARAMS = { m: 65536, t: 3, p: 4 } as const

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const isDev = process.env['NODE_ENV'] === 'development'
const VAULT_FILE_FOLDERS = new Set(['imports', 'statements', 'receipts', 'exports'])

let currentApiPort: number | null = null
let mainWindow: BrowserWindow | null = null
let vaultManager: VaultManager
const vaultWatcher = new VaultWatcher()
let recurringIntervalId: ReturnType<typeof setInterval> | null = null

function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      if (addr && typeof addr === 'object') {
        const { port } = addr
        server.close(() => resolve(port))
      } else {
        server.close(() => reject(new Error('Could not determine a free port')))
      }
    })
  })
}

function requireCurrentVaultPath(): string {
  const current = vaultManager.getCurrent()
  if (!current) throw new Error('No vault selected')
  return current.path
}

function resolveInsideVault(vaultPath: string, requestedPath: string): string {
  const root = path.resolve(vaultPath)
  const resolved = path.resolve(requestedPath)
  const relative = path.relative(root, resolved)
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('File is outside the current vault')
  }
  return resolved
}

function targetFolderPath(vaultPath: string, targetFolder: string): string {
  if (!VAULT_FILE_FOLDERS.has(targetFolder)) {
    throw new Error('Unknown vault folder')
  }
  return path.join(vaultPath, targetFolder)
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

async function isDefaultOllamaReady(): Promise<boolean> {
  try {
    const res = await fetch('http://127.0.0.1:11434/api/tags', {
      signal: AbortSignal.timeout(1000),
    })
    return res.ok
  } catch {
    return false
  }
}

// ── At-rest encryption key (SQLCipher infrastructure) ────────────────────────
// Generates a 256-bit random key on first launch, encrypts it with the OS
// credential store (macOS Keychain / Windows DPAPI / Linux libsecret) via
// Electron's safeStorage API, and persists the encrypted blob to userData.
//
// The key is surfaced as COREBOOKS_DB_KEY so src/db/client.ts can apply it
// as a SQLCipher PRAGMA once a compatible Prisma adapter is available.
// Until then, the key exists and is safely stored — but the database file
// itself is not yet encrypted. See src/db/client.ts for the hook point.
function getOrCreateEncryptionKey(userData: string): void {
  // Guard: if vault:unlock or resetPasswordAfterRecovery already set the key
  // from a password-derived vault key K, do not overwrite it with the OS
  // keychain key (which would open the wrong database).
  if (process.env['COREBOOKS_DB_KEY']) return

  if (!safeStorage.isEncryptionAvailable()) {
    // safeStorage is unavailable (e.g. headless CI). Skip key setup.
    return
  }

  const keyFile = path.join(userData, '.db.key')

  try {
    if (fs.existsSync(keyFile)) {
      const encrypted = fs.readFileSync(keyFile)
      process.env['COREBOOKS_DB_KEY'] = safeStorage.decryptString(encrypted)
    } else {
      // First launch: generate a fresh 256-bit (32-byte) key as a hex string.
      const key = randomBytes(32).toString('hex')
      const encrypted = safeStorage.encryptString(key)
      // 0o600 = owner read/write only — no other OS user can read the file.
      fs.writeFileSync(keyFile, encrypted, { mode: 0o600 })
      process.env['COREBOOKS_DB_KEY'] = key
    }
  } catch {
    // If the OS keychain call fails (e.g. locked keychain at login),
    // proceed without setting the key. The app remains functional.
  }
}

async function startApiForVault(vaultPath: string): Promise<number> {
  const port = await findFreePort()
  const dbPath = path.join(vaultPath, 'corebooks.db')
  process.env['DATABASE_URL'] = `file:${dbPath}`

  const userData = app.getPath('userData')
  getOrCreateEncryptionKey(userData)

  // Dynamic import ensures all env vars are set before Prisma initialises.
  const { startServer } = await import('../api/bootstrap.js')
  await startServer(port)

  // Start file watcher for the newly selected vault
  if (mainWindow) vaultWatcher.start(vaultPath, mainWindow)

  // Fire recurring template check on launch, then every 24 hours.
  async function checkRecurring() {
    try {
      const { fireOverdueTemplates } = await import('../api/services/recurringService.js')
      const { ledger: activeLedger } = await import('../api/bootstrap.js')
      await fireOverdueTemplates(activeLedger)
    } catch (err) {
      console.error('[recurring] check failed:', err)
    }
  }
  if (recurringIntervalId !== null) clearInterval(recurringIntervalId)
  checkRecurring()
  recurringIntervalId = setInterval(checkRecurring, 24 * 60 * 60 * 1000)

  return port
}

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  if (isDev) {
    await mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    await mainWindow.loadFile(path.join(__dirname, '../ui/index.html'))
  }
}

function registerIpc(): void {
  ipcMain.on('vault:getState', (event) => {
    const state: VaultState = {
      apiPort: currentApiPort,
      vaultName: vaultManager.getCurrent()?.name ?? null,
      vaultPath: vaultManager.getCurrent()?.path ?? null,
    }
    event.returnValue = state
  })

  ipcMain.handle('vault:list', () => vaultManager.list())

  ipcMain.handle('vault:create', async (_event, name: string, dirPath: string) => {
    const entry = vaultManager.create(name, dirPath)
    vaultManager.select(entry.path)
    currentApiPort = await startApiForVault(entry.path)
    mainWindow?.webContents.send('vault:ready')
    return entry
  })

  ipcMain.handle('vault:select', async (_event, vaultPath: string) => {
    vaultManager.select(vaultPath)
    // If the vault has a password, the renderer must collect the password and
    // call vault:unlock before the API is started. Return a sentinel so the UI
    // can show the UnlockVaultModal instead of waiting for vault:ready.
    const enc = vaultManager.getEncryption()
    if (enc !== null) {
      return { needsPassword: true }
    }
    currentApiPort = await startApiForVault(vaultPath)
    mainWindow?.webContents.send('vault:ready')
    return { needsPassword: false }
  })

  // Called by UnlockVaultModal after vault:select returns { needsPassword: true }.
  // Derives the vault key K from the user's password, sets COREBOOKS_DB_KEY,
  // then starts the API. On success the renderer receives vault:ready exactly
  // as it would for an unencrypted vault.
  ipcMain.handle('vault:unlock', async (_event, password: string) => {
    const current = vaultManager.getCurrent()
    if (!current) throw new Error('No vault selected')
    const enc = vaultManager.getEncryption()
    if (!enc) throw new Error('Vault has no encryption configured')
    if (!password) throw new Error('Password must not be empty')

    const { salt, iv, ct } = enc.slots.password
    const derivedKey = Buffer.from(
      argon2id(Buffer.from(password, 'utf-8'), Buffer.from(salt, 'hex'), { ...enc.argon2, dkLen: 32 }),
    )
    // decryptVaultKey throws on wrong password / bad auth tag.
    let vaultKey: Buffer
    try {
      vaultKey = decryptVaultKey(Buffer.from(ct, 'hex'), derivedKey, Buffer.from(iv, 'hex'))
    } catch {
      throw new Error('Password is incorrect')
    }

    // Set env var before startApiForVault calls getOrCreateEncryptionKey.
    // The guard added to getOrCreateEncryptionKey will see this and skip the
    // OS-keychain lookup so K is not overwritten.
    process.env['COREBOOKS_DB_KEY'] = vaultKey.toString('hex')

    currentApiPort = await startApiForVault(current.path)
    mainWindow?.webContents.send('vault:ready')
  })

  ipcMain.handle('vault:rename', (_event, newName: string) => {
    const newPath = vaultManager.rename(newName)
    app.relaunch()
    app.exit(0)
    return { newPath }
  })

  ipcMain.handle('vault:showInExplorer', () => {
    const current = vaultManager.getCurrent()
    if (current) shell.showItemInFolder(current.path)
  })

  ipcMain.handle('vault:chooseDirectory', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
    })
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })

  // Restarts the app cleanly so the vault picker shows on next launch.
  // Required because the Prisma client singleton can't be re-pointed to a
  // different database within the same process.
  ipcMain.handle('vault:relaunch', () => {
    vaultManager.setSkipPickerUntil(null)
    app.relaunch()
    app.exit(0)
  })

  ipcMain.handle('vault:setSkipUntil', (_event, until: string | null) => {
    vaultManager.setSkipPickerUntil(until)
  })

  ipcMain.handle('vault:getSkipUntil', () => {
    return vaultManager.getSkipPickerUntil()
  })

  // ── Vault encryption operations ────────────────────────────────────────────

  ipcMain.handle('vault:getEncryptionStatus', () => {
    const enc = vaultManager.getEncryption()
    return { encrypted: enc !== null }
  })

  ipcMain.handle('vault:setupEncryption', (_event, password: string) => {
    if (vaultManager.getEncryption() !== null) {
      throw new Error('Vault is already encrypted')
    }
    if (!password) throw new Error('Password must not be empty')
    // Plan E/F: COREBOOKS_DB_KEY IS the vault key K. Wrap the existing key
    // rather than generating a new random one — generating a new key would
    // require re-encrypting the database, because the database was already
    // opened (and will be opened in future) with this same K.
    const hexKey = process.env['COREBOOKS_DB_KEY']
    if (!hexKey) throw new Error('Encryption key not initialized — open the vault first')
    const vaultKey = Buffer.from(hexKey, 'hex')
    const phrase = generateRecoveryPhrase()
    const entropy = recoveryPhraseToEntropy(phrase)

    const saltA = randomBytes(32); const ivA = randomBytes(12)
    // Buffer.from creates an owned copy — argon2id returns a Uint8Array sharing
    // an ArrayBuffer whose offset may be non-zero; copy is required for correctness.
    const derivedA = Buffer.from(
      argon2id(Buffer.from(password, 'utf-8'), saltA, { ...ARGON2_PARAMS, dkLen: 32 }),
    )
    const slotA = encryptVaultKey(vaultKey, derivedA, ivA)

    const saltB = randomBytes(32); const ivB = randomBytes(12)
    const derivedB = Buffer.from(
      argon2id(entropy, saltB, { ...ARGON2_PARAMS, dkLen: 32 }),
    )
    const slotB = encryptVaultKey(vaultKey, derivedB, ivB)

    const enc: VaultEncryption = {
      algorithm: 'argon2id-aes256-gcm',
      argon2: { ...ARGON2_PARAMS },
      slots: {
        password: { salt: saltA.toString('hex'), iv: ivA.toString('hex'), ct: slotA.toString('hex') },
        recovery: { salt: saltB.toString('hex'), iv: ivB.toString('hex'), ct: slotB.toString('hex') },
      },
    }
    vaultManager.setEncryption(enc)
    return { phraseWords: phrase }
  })

  ipcMain.handle('vault:verifyPassword', (_event, password: string) => {
    const enc = vaultManager.getEncryption()
    if (!enc) return false
    try {
      const { salt, iv, ct } = enc.slots.password
      const derivedKey = Buffer.from(
        argon2id(Buffer.from(password, 'utf-8'), Buffer.from(salt, 'hex'), { ...enc.argon2, dkLen: 32 }),
      )
      decryptVaultKey(Buffer.from(ct, 'hex'), derivedKey, Buffer.from(iv, 'hex'))
      return true
    } catch {
      return false
    }
  })

  ipcMain.handle('vault:changePassword', (_event, oldPassword: string, newPassword: string) => {
    const enc = vaultManager.getEncryption()
    if (!enc) throw new Error('Vault is not encrypted')
    if (!newPassword) throw new Error('Password must not be empty')
    if (newPassword.length < 8) throw new Error('New password must be at least 8 characters')
    const { salt, iv, ct } = enc.slots.password
    const derivedOld = Buffer.from(
      argon2id(Buffer.from(oldPassword, 'utf-8'), Buffer.from(salt, 'hex'), { ...enc.argon2, dkLen: 32 }),
    )
    let vaultKey: Buffer
    try {
      vaultKey = decryptVaultKey(Buffer.from(ct, 'hex'), derivedOld, Buffer.from(iv, 'hex'))
    } catch {
      throw new Error('Password is incorrect')
    }

    const saltA = randomBytes(32); const ivA = randomBytes(12)
    const derivedNew = Buffer.from(
      argon2id(Buffer.from(newPassword, 'utf-8'), saltA, { ...ARGON2_PARAMS, dkLen: 32 }),
    )
    const newSlot = encryptVaultKey(vaultKey, derivedNew, ivA)
    enc.slots.password = {
      salt: saltA.toString('hex'),
      iv: ivA.toString('hex'),
      ct: newSlot.toString('hex'),
    }
    // Only the password slot is re-wrapped. The recovery slot wraps the
    // same vault key K and remains valid without modification.
    vaultManager.setEncryption(enc)
  })

  ipcMain.handle('vault:removeEncryption', (_event, password: string) => {
    const enc = vaultManager.getEncryption()
    if (!enc) throw new Error('Vault is not encrypted')
    const { salt, iv, ct } = enc.slots.password
    const derivedKey = Buffer.from(
      argon2id(Buffer.from(password, 'utf-8'), Buffer.from(salt, 'hex'), { ...enc.argon2, dkLen: 32 }),
    )
    // Throws on wrong password — guards against unauthorized removal.
    try {
      decryptVaultKey(Buffer.from(ct, 'hex'), derivedKey, Buffer.from(iv, 'hex'))
    } catch {
      throw new Error('Password is incorrect')
    }
    vaultManager.removeEncryption()
  })

  ipcMain.handle('vault:regenerateRecovery', (_event, password: string) => {
    const enc = vaultManager.getEncryption()
    if (!enc) throw new Error('Vault is not encrypted')
    const { salt, iv, ct } = enc.slots.password
    const derivedKey = Buffer.from(
      argon2id(Buffer.from(password, 'utf-8'), Buffer.from(salt, 'hex'), { ...enc.argon2, dkLen: 32 }),
    )
    let vaultKey: Buffer
    try {
      vaultKey = decryptVaultKey(Buffer.from(ct, 'hex'), derivedKey, Buffer.from(iv, 'hex'))
    } catch {
      throw new Error('Password is incorrect')
    }

    const phrase = generateRecoveryPhrase()
    const entropy = recoveryPhraseToEntropy(phrase)
    const saltB = randomBytes(32); const ivB = randomBytes(12)
    const derivedB = Buffer.from(
      argon2id(entropy, saltB, { ...ARGON2_PARAMS, dkLen: 32 }),
    )
    const slotB = encryptVaultKey(vaultKey, derivedB, ivB)
    enc.slots.recovery = {
      salt: saltB.toString('hex'),
      iv: ivB.toString('hex'),
      ct: slotB.toString('hex'),
    }
    vaultManager.setEncryption(enc)
    return { phraseWords: phrase }
  })

  ipcMain.handle('vault:resetPasswordAfterRecovery', (_event, words: string[], newPassword: string) => {
    const enc = vaultManager.getEncryption()
    if (!enc) throw new Error('Vault is not encrypted')
    if (!isValidPhrase(words)) throw new Error('Invalid recovery phrase')
    if (!newPassword) throw new Error('Password must not be empty')
    if (newPassword.length < 8) throw new Error('New password must be at least 8 characters')
    const entropy = recoveryPhraseToEntropy(words)
    const { salt, iv, ct } = enc.slots.recovery
    const derivedB = Buffer.from(
      argon2id(entropy, Buffer.from(salt, 'hex'), { ...enc.argon2, dkLen: 32 }),
    )
    let vaultKey: Buffer
    try {
      vaultKey = decryptVaultKey(Buffer.from(ct, 'hex'), derivedB, Buffer.from(iv, 'hex'))
    } catch {
      throw new Error('Invalid recovery phrase')
    }

    const saltA = randomBytes(32); const ivA = randomBytes(12)
    const derivedA = Buffer.from(
      argon2id(Buffer.from(newPassword, 'utf-8'), saltA, { ...ARGON2_PARAMS, dkLen: 32 }),
    )
    const newSlot = encryptVaultKey(vaultKey, derivedA, ivA)
    enc.slots.password = {
      salt: saltA.toString('hex'),
      iv: ivA.toString('hex'),
      ct: newSlot.toString('hex'),
    }
    vaultManager.setEncryption(enc)

    // Re-save vault key K to the OS keychain so future transparent auto-opens
    // (non-password path) continue to work. Without this, the keychain would
    // still hold the OLD random key from first launch, which would not match
    // the vault database that was re-encrypted with the recovered K.
    const userData = app.getPath('userData')
    if (safeStorage.isEncryptionAvailable()) {
      try {
        const keyPath = path.join(userData, '.db.key')
        const encryptedKey = safeStorage.encryptString(vaultKey.toString('hex'))
        fs.writeFileSync(keyPath, encryptedKey, { mode: 0o600 })
      } catch {
        // Non-fatal: keychain write failure — the vault can still be opened
        // with the password next time.
      }
    }
  })

  // ── Vault file operations ────────────────────────────────────────────────────

  ipcMain.handle('vault:listImports', () => {
    const current = vaultManager.getCurrent()
    if (!current) return []
    const dir = path.join(current.path, 'imports')
    try {
      return fs.readdirSync(dir)
        .filter((name) => !name.startsWith('.'))
        .map((name) => {
          const full = path.join(dir, name)
          const stat = fs.statSync(full)
          return { name, path: full, size: stat.size, mtime: stat.mtimeMs }
        })
    } catch { return [] }
  })

  ipcMain.handle('vault:listVaultFiles', () => {
    const current = vaultManager.getCurrent()
    if (!current) return []
    const subdirs = ['imports', 'statements', 'receipts', 'exports']
    const results: { folder: string; name: string; path: string; size: number; mtime: number }[] = []
    for (const folder of subdirs) {
      const dir = path.join(current.path, folder)
      try {
        fs.readdirSync(dir)
          .filter((name) => !name.startsWith('.'))
          .forEach((name) => {
            const full = path.join(dir, name)
            const stat = fs.statSync(full)
            results.push({ folder, name, path: full, size: stat.size, mtime: stat.mtimeMs })
          })
      } catch { /* skip if dir missing */ }
    }
    return results
  })

  ipcMain.handle('vault:moveFile', (_event, srcPath: string, targetFolder: string) => {
    const vaultPath = requireCurrentVaultPath()
    const src = resolveInsideVault(vaultPath, srcPath)
    const name = path.basename(src)
    const dest = resolveInsideVault(vaultPath, path.join(targetFolderPath(vaultPath, targetFolder), name))
    fs.renameSync(src, dest)
    return dest
  })

  ipcMain.handle('vault:deleteFile', (_event, filePath: string) => {
    const vaultPath = requireCurrentVaultPath()
    fs.unlinkSync(resolveInsideVault(vaultPath, filePath))
  })

  ipcMain.handle('vault:readFile', (_event, filePath: string) => {
    const vaultPath = requireCurrentVaultPath()
    return fs.readFileSync(resolveInsideVault(vaultPath, filePath), 'utf-8')
  })

  ipcMain.handle('vault:safeStorageAvailable', () => safeStorage.isEncryptionAvailable())

  // Returns (and creates if needed) the default base directory for new vaults,
  // mirroring Obsidian's convention of a dedicated app folder inside Documents.
  ipcMain.handle('vault:getDefaultBase', () => {
    const base = path.join(app.getPath('documents'), 'corebooks')
    fs.mkdirSync(base, { recursive: true })
    return base
  })

  // ── Ollama process management ────────────────────────────────────────────────

  ipcMain.handle('ollama:start', async () => {
    if (await isDefaultOllamaReady()) return true

    const { spawn } = await import('child_process')
    const binary = process.platform === 'win32' ? 'ollama.exe' : 'ollama'
    let failedToStart = false

    try {
      const child = spawn(binary, ['serve'], { detached: true, stdio: 'ignore' })
      child.unref()
      child.once('error', () => { failedToStart = true })
      child.once('exit', () => { failedToStart = true })
    } catch {
      return false
    }

    for (let attempt = 0; attempt < 20; attempt++) {
      if (await isDefaultOllamaReady()) return true
      if (failedToStart) return false
      await sleep(500)
    }
    return false
  })
}

app.whenReady().then(async () => {
  const userData = app.getPath('userData')
  vaultManager = new VaultManager(userData)

  registerIpc()

  // If the user requested "skip picker for 30 days", auto-select the last vault
  // before creating the window. This means the preload's sendSync('vault:getState')
  // will see a non-null apiPort, so VaultGate renders the app directly.
  //
  // Password-protected vaults cannot be auto-opened because the password has not
  // yet been entered. Skip auto-open for those vaults so the vault picker shows
  // and the user can select the vault, triggering the UnlockVaultModal flow.
  const skipUntil = vaultManager.getSkipPickerUntil()
  if (skipUntil && new Date(skipUntil) > new Date()) {
    const knownVaults = vaultManager.list()
    if (knownVaults.length > 0) {
      try {
        vaultManager.select(knownVaults[0].path)
        const enc = vaultManager.getEncryption()
        if (enc !== null) {
          // Password-protected vault — do not auto-open; show the vault picker
          // so the user can enter their password via UnlockVaultModal.
          vaultManager.select(knownVaults[0].path) // keep selection so picker knows which vault
          currentApiPort = null
        } else {
          currentApiPort = await startApiForVault(knownVaults[0].path)
        }
      } catch {
        // Vault unavailable (moved or deleted) — fall through to show picker
        currentApiPort = null
      }
    }
  }

  await createWindow()

  // If a vault was auto-selected above, mainWindow now exists but the file
  // watcher was not started (mainWindow was null during startApiForVault).
  // Start it now.
  if (currentApiPort !== null && vaultManager.getCurrent() && mainWindow) {
    vaultWatcher.start(vaultManager.getCurrent()!.path, mainWindow)
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  vaultWatcher.stop()
})
