import { app, BrowserWindow, safeStorage } from 'electron';
import { createServer } from 'net';
import { randomBytes } from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = process.env['NODE_ENV'] === 'development';

function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        const { port } = addr;
        server.close(() => resolve(port));
      } else {
        server.close(() => reject(new Error('Could not determine a free port')));
      }
    });
  });
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
    return;
  }

  const keyFile = path.join(userData, '.db.key');

  try {
    if (fs.existsSync(keyFile)) {
      const encrypted = fs.readFileSync(keyFile);
      process.env['COREBOOKS_DB_KEY'] = safeStorage.decryptString(encrypted);
    } else {
      // First launch: generate a fresh 256-bit (32-byte) key as a hex string.
      const key = randomBytes(32).toString('hex');
      const encrypted = safeStorage.encryptString(key);
      // 0o600 = owner read/write only — no other OS user can read the file.
      fs.writeFileSync(keyFile, encrypted, { mode: 0o600 });
      process.env['COREBOOKS_DB_KEY'] = key;
    }
  } catch {
    // If the OS keychain call fails (e.g. locked keychain at login),
    // proceed without setting the key. The app remains functional.
  }
}

async function startApi(): Promise<number> {
  const port = await findFreePort();

  const userData = app.getPath('userData');

  // Set DATABASE_URL before any Prisma module loads so the client singleton
  // picks up the userData path rather than a cwd-relative default.
  if (!process.env['DATABASE_URL']) {
    const dbPath = path.join(userData, 'corebooks.db');
    process.env['DATABASE_URL'] = `file:${dbPath}`;
  }

  // Generate / retrieve the at-rest encryption key from the OS keychain.
  // Must be called after app.getPath('userData') is available.
  getOrCreateEncryptionKey(userData);

  // Dynamic import ensures all env vars are set before Prisma initialises.
  const { startServer } = await import('../api/bootstrap.js');
  await startServer(port);
  return port;
}

async function createWindow(apiPort: number): Promise<void> {
  const win = new BrowserWindow({
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
      // Port is passed as a process argument so the preload can read it
      // synchronously without an async IPC round-trip.
      additionalArguments: [`--api-port=${apiPort}`],
    },
  });

  if (isDev) {
    await win.loadURL('http://localhost:5173');
    win.webContents.openDevTools();
  } else {
    await win.loadFile(path.join(__dirname, '../ui/index.html'));
  }
}

app.whenReady().then(async () => {
  const port = await startApi();
  await createWindow(port);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow(port);
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
