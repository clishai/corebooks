import { app, BrowserWindow, ipcMain, shell, dialog, safeStorage } from 'electron'
import { createServer } from 'net'
import { randomBytes } from 'crypto'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { VaultManager } from './vaultManager.js'
import { VaultWatcher } from './vaultWatcher.js'
import type { VaultState } from './vaultTypes.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const isDev = process.env['NODE_ENV'] === 'development'

let currentApiPort: number | null = null
let mainWindow: BrowserWindow | null = null
let vaultManager: VaultManager
const vaultWatcher = new VaultWatcher()

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
  checkRecurring()
  setInterval(checkRecurring, 24 * 60 * 60 * 1000)

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
    currentApiPort = await startApiForVault(vaultPath)
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
    app.relaunch()
    app.exit(0)
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
    const current = vaultManager.getCurrent()
    if (!current) throw new Error('No vault selected')
    const name = path.basename(srcPath)
    const dest = path.join(current.path, targetFolder, name)
    fs.renameSync(srcPath, dest)
    return dest
  })

  ipcMain.handle('vault:deleteFile', (_event, filePath: string) => {
    fs.unlinkSync(filePath)
  })

  ipcMain.handle('vault:readFile', (_event, filePath: string) => {
    return fs.readFileSync(filePath, 'utf-8')
  })

  // ── Ollama process management ────────────────────────────────────────────────

  ipcMain.handle('ollama:start', async () => {
    const { spawn } = await import('child_process')
    const binary = process.platform === 'win32' ? 'ollama.exe' : 'ollama'
    return new Promise<boolean>((resolve) => {
      const child = spawn(binary, ['serve'], { detached: true, stdio: 'ignore' })
      child.unref()
      child.on('error', () => resolve(false))
      setTimeout(() => resolve(true), 2000)
    })
  })
}

app.whenReady().then(async () => {
  const userData = app.getPath('userData')
  vaultManager = new VaultManager(userData)

  registerIpc()
  await createWindow()

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
