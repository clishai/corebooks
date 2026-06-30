import { app, BrowserWindow, ipcMain, shell, dialog, safeStorage } from 'electron'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import path from 'node:path'
import { VaultLifecycle } from './vault/lifecycle.js'
import { createBiometricStore, type BiometricBackend } from './vault/biometric.js'
import { createPrismaClient } from '../db/client.js'
import { startApi } from '../api/bootstrap.js'
import { migrateLegacyVault } from './vault/migration.js'
import { VaultWatcher } from './vaultWatcher.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const isDev = process.env['NODE_ENV'] === 'development'
const VAULT_FILE_FOLDERS = new Set(['imports', 'statements', 'receipts', 'exports'])

let mainWindow: BrowserWindow | null = null
let currentApiPort: number | null = null
let pendingSettingsPath: string | null = null
let recurringIntervalId: ReturnType<typeof setInterval> | null = null

const vaultWatcher = new VaultWatcher()

// ── BiometricBackend backed by Electron safeStorage ──────────────────────────
// The in-memory Map stores encrypted key blobs keyed by vault ID label.
// NOTE: This is process-lifetime only — biometric keys are NOT persisted to
// disk in this implementation. Persistence (write encrypted blob to userData)
// is a follow-up.
const electronItems = new Map<string, Buffer>()

const electronBackend: BiometricBackend = {
  isEncryptionAvailable: () => safeStorage.isEncryptionAvailable(),
  encryptString: (plain) => safeStorage.encryptString(plain),
  decryptString: (encrypted) => safeStorage.decryptString(encrypted),
  put: (label, value) => { electronItems.set(label, value) },
  get: (label) => electronItems.get(label) ?? null,
  remove: (label) => { electronItems.delete(label) },
}

// ── Helpers ──────────────────────────────────────────────────────────────────

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
  if (!VAULT_FILE_FOLDERS.has(targetFolder)) throw new Error('Unknown vault folder')
  return path.join(vaultPath, targetFolder)
}

async function checkRecurring() {
  try {
    const { fireOverdueTemplates } = await import('../api/services/recurringService.js')
    const { ledger: activeLedger } = await import('../api/bootstrap.js')
    await fireOverdueTemplates(activeLedger)
  } catch (err) {
    console.error('[recurring] check failed:', err)
  }
}

// ── Window ──────────────────────────────────────────────────────────────────

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

  mainWindow.webContents.on('before-input-event', (_event, input) => {
    if ((input.meta || input.control) && input.alt && input.key === 'i') {
      mainWindow?.webContents.openDevTools()
    }
  })
}

// ── App ready ────────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  // lifecycle must be created after app is ready (app.getPath requires it)
  const lifecycle = new VaultLifecycle({
    dbFactory: {
      async open({ filePath, key }) {
        const { client, db } = createPrismaClient({ filePath, key })
        const port = await startApi({ prisma: client, db })
        currentApiPort = port

        // Start recurring template check
        if (recurringIntervalId !== null) clearInterval(recurringIntervalId)
        checkRecurring()
        recurringIntervalId = setInterval(checkRecurring, 24 * 60 * 60 * 1000)

        return {
          async close() {
            if (recurringIntervalId !== null) {
              clearInterval(recurringIntervalId)
              recurringIntervalId = null
            }
            await client.$disconnect()
            // db is closed by the Prisma adapter
          },
        }
      },
    },
    biometric: createBiometricStore(electronBackend),
    pickerRegistryPath: path.join(app.getPath('userData'), 'picker.json'),
  })

  // ── IPC: vault metadata ──────────────────────────────────────────────────

  ipcMain.on('vault:getApiBaseUrl', (event) => {
    event.returnValue = currentApiPort ? `http://127.0.0.1:${currentApiPort}` : null
  })

  ipcMain.handle('vault:list', () => {
    const file = path.join(app.getPath('userData'), 'picker.json')
    if (!fs.existsSync(file)) return []
    try {
      const reg = JSON.parse(fs.readFileSync(file, 'utf-8'))
      return (reg.vaults ?? []).sort(
        (a: { lastOpened: string }, b: { lastOpened: string }) =>
          new Date(b.lastOpened).getTime() - new Date(a.lastOpened).getTime(),
      )
    } catch { return [] }
  })

  ipcMain.handle('vault:create', async (_e, args) => {
    const result = await lifecycle.create(args)
    if (mainWindow) vaultWatcher.start(result.vault.path, mainWindow)
    mainWindow?.webContents.send('vault:ready')
    return result
  })

  ipcMain.handle('vault:open', async (_e, args) => {
    const result = await lifecycle.open(args)
    if (result.status === 'opened') {
      if (mainWindow) vaultWatcher.start(result.vault.path, mainWindow)
      mainWindow?.webContents.send('vault:ready')
    }
    if (result.status === 'needs-settings-confirmation') {
      pendingSettingsPath = (args as { path: string }).path
    }
    return result
  })

  ipcMain.handle('vault:close', async () => {
    vaultWatcher.stop()
    await lifecycle.close()
    currentApiPort = null
  })

  ipcMain.handle('vault:switch', async (_e, args) => {
    vaultWatcher.stop()
    const result = await lifecycle.switch({ target: args })
    if (result.status === 'opened') {
      if (mainWindow) vaultWatcher.start(result.vault.path, mainWindow)
      mainWindow?.webContents.send('vault:ready')
    }
    return result
  })

  ipcMain.handle('vault:unlockWithRecovery', async (_e, args) => {
    const result = await lifecycle.unlockWithRecovery(args)
    if (result.status === 'opened') {
      if (mainWindow) vaultWatcher.start(result.vault.path, mainWindow)
      mainWindow?.webContents.send('vault:ready')
    }
    return result
  })

  ipcMain.handle('vault:confirmDefaultSettings', async () => {
    if (!pendingSettingsPath) throw new Error('NoPendingSettingsConfirmation')
    const { writeSettings } = await import('./vault/settings.js')
    const { DEFAULT_VAULT_SETTINGS } = await import('./vault/defaults.js')
    const displayName = path.basename(pendingSettingsPath)
    writeSettings(pendingSettingsPath, { ...DEFAULT_VAULT_SETTINGS, companyName: displayName })
    pendingSettingsPath = null
  })

  ipcMain.handle('vault:chooseDirectory', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })

  ipcMain.handle('vault:showInExplorer', async (_e, vaultPath: string) => {
    shell.showItemInFolder(vaultPath)
  })

  ipcMain.handle('vault:migrateLegacy', async (_e, args: { path: string; password: string }) => {
    const oldKeyPath = path.join(app.getPath('userData'), '.db.key')
    if (!fs.existsSync(oldKeyPath)) throw new Error('LegacyKeyMissing')
    const encrypted = fs.readFileSync(oldKeyPath)
    const hex = safeStorage.decryptString(encrypted)
    const oldKey = Buffer.from(hex, 'hex')
    try {
      const displayName = path.basename(args.path)
      const result = await migrateLegacyVault({
        vaultPath: args.path, oldGlobalKey: oldKey, password: args.password, displayName,
      })
      return { recoveryPhrase: result.recoveryPhrase }
    } finally {
      oldKey.fill(0)
    }
  })

  ipcMain.handle('vault:enableBiometric', async () => lifecycle.enableBiometricForActiveVault())
  ipcMain.handle('vault:disableBiometric', async () => lifecycle.disableBiometricForActiveVault())
  ipcMain.handle('vault:isBiometricAvailable', () => safeStorage.isEncryptionAvailable())

  // ── IPC: vault file operations ───────────────────────────────────────────

  ipcMain.handle('vault:listImports', () => {
    const current = lifecycle.current
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
    const current = lifecycle.current
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

  ipcMain.handle('vault:moveFile', (_e, srcPath: string, targetFolder: string) => {
    const current = lifecycle.current
    if (!current) throw new Error('No vault selected')
    const src = resolveInsideVault(current.path, srcPath)
    const name = path.basename(src)
    const dest = resolveInsideVault(current.path, path.join(targetFolderPath(current.path, targetFolder), name))
    fs.renameSync(src, dest)
    return dest
  })

  ipcMain.handle('vault:deleteFile', (_e, filePath: string) => {
    const current = lifecycle.current
    if (!current) throw new Error('No vault selected')
    fs.unlinkSync(resolveInsideVault(current.path, filePath))
  })

  ipcMain.handle('vault:readFile', (_e, filePath: string) => {
    const current = lifecycle.current
    if (!current) throw new Error('No vault selected')
    return fs.readFileSync(resolveInsideVault(current.path, filePath), 'utf-8')
  })

  ipcMain.handle('vault:getDefaultBase', () => {
    const base = path.join(app.getPath('documents'), 'corebooks')
    fs.mkdirSync(base, { recursive: true })
    return base
  })

  // ── Lifecycle ────────────────────────────────────────────────────────────

  app.on('before-quit', async () => {
    vaultWatcher.stop()
    await lifecycle.close()
  })

  // ── Window ───────────────────────────────────────────────────────────────

  await createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
