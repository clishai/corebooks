# Vault Architecture Design

## Goal

Replace the fixed single-database model with a transparent, filesystem-first vault system. A vault is a named folder the user controls — it contains the database, documents, and metadata. On every launch the user picks which vault to open or creates a new one. Vault names are editable from within the app and the change propagates to the actual folder on disk.

## What a Vault Is

A vault is a directory with a defined structure:

```
~/Documents/My Business/       ← user-chosen path and name
  .corebooks                   ← JSON metadata: name, version, created
  corebooks.db                 ← the SQLite database for this vault
  imports/                     ← drop files here to trigger import (future)
  statements/                  ← archived bank statements (future)
  receipts/                    ← receipt documents linked to entries (future)
  exports/                     ← app-generated report files (future)
```

The `.corebooks` metadata file is the vault's identity:

```json
{
  "version": "1",
  "name": "My Business",
  "created": "2026-05-08T12:00:00.000Z"
}
```

The database lives at `<vault>/corebooks.db`. Encryption keys remain in Electron's `userData` (OS keychain via `safeStorage`) — not inside the vault folder, so the vault can be moved or shared without exposing key material.

## Vault Registry

A registry file at `<userData>/vaults.json` tracks known vaults:

```json
{
  "vaults": [
    {
      "path": "/Users/brady/Documents/My Business",
      "name": "My Business",
      "lastOpened": "2026-05-08T12:00:00.000Z"
    },
    {
      "path": "/Users/brady/Documents/Side Project",
      "name": "Side Project",
      "lastOpened": "2026-05-01T09:00:00.000Z"
    }
  ]
}
```

The registry is the only file that lives outside a vault. It is never opened by the user directly.

## Launch Flow

```
app.whenReady()
  → createWindow(null)        ← no API port yet
  → window loads React app
  → preload sync-calls vault:getState → { apiPort: null, ... }
  → App.tsx detects apiBaseUrl null → renders VaultPickerPage full-screen
  → user picks or creates a vault
  → vault:select IPC → main starts API with vault DB path
  → main sends vault:ready to window
  → preload listener fires → window.location.reload()
  → preload sync-calls vault:getState again → { apiPort: 5XXX, ... }
  → App.tsx renders normally
```

Always shows the vault picker on launch, regardless of how many vaults exist. The single-vault case is fast (one click to open). "Switch vault" in Settings restarts this flow.

## VaultManager (src/electron/vaultManager.ts)

Single class responsible for registry I/O and vault filesystem operations:

- `list()` → returns `VaultEntry[]` sorted by lastOpened desc
- `create(name, dirPath)` → mkdir, write `.corebooks`, create subdirs, add to registry, return entry
- `select(vaultPath)` → validate vault folder, update lastOpened in registry, set as current
- `getCurrent()` → current `VaultEntry | null`
- `rename(newName)` → update `.corebooks` metadata, rename folder on disk, update registry path + name, return new path
- `removeFromRegistry(vaultPath)` → remove without deleting files

Vault name → folder name sanitization: strip characters illegal on any major OS (`/\:*?"<>|`), trim whitespace, collapse spaces, max 64 chars.

## IPC Surface (preload.ts additions)

```ts
vault: {
  getState: () => ipcRenderer.sendSync('vault:getState'),
  // → { apiPort: number | null, vaultName: string | null, vaultPath: string | null }

  list: () => ipcRenderer.invoke('vault:list'),
  // → VaultEntry[]

  create: (name: string, dirPath: string) => ipcRenderer.invoke('vault:create', name, dirPath),
  // → VaultEntry

  select: (dirPath: string) => ipcRenderer.invoke('vault:select', dirPath),
  // → void (triggers vault:ready event after API starts)

  rename: (newName: string) => ipcRenderer.invoke('vault:rename', newName),
  // → { newPath: string } then app.relaunch() + app.exit(0)

  showInExplorer: () => ipcRenderer.invoke('vault:showInExplorer'),
  // → opens vault folder in Finder/Explorer

  chooseDirectory: () => ipcRenderer.invoke('vault:chooseDirectory'),
  // → string | null (native folder picker)

  onReady: (cb: () => void) => ipcRenderer.on('vault:ready', cb),
}
```

## main.ts Changes

- `createWindow` no longer receives an apiPort argument; it creates the window immediately, without starting the API first.
- `ipcMain.on('vault:getState', ...)` handles synchronous queries from the preload.
- `ipcMain.handle('vault:select', ...)` starts the API (same `startApi()` function, just with the vault's `corebooks.db` path as `DATABASE_URL`), then sends `vault:ready` to the window.
- `ipcMain.handle('vault:rename', ...)` calls `vaultManager.rename()`, then `app.relaunch()` + `app.exit(0)`.
- All existing `startApi()` logic is unchanged except that `DATABASE_URL` is set from the vault path rather than userData.

## VaultPickerPage (src/ui/pages/VaultPickerPage.tsx)

Full-screen page rendered when `window.electronAPI.apiBaseUrl` is null. No API calls — only IPC.

Layout:
- corebooks logo + "Open a vault" heading
- Grid of vault cards: name (large), path (small, muted), last-opened date
- Each card: single-click to open
- "New Vault" button → inline form: vault name input + folder path (via native picker) + Create
- "Open existing..." button → native folder picker → validates if already a vault or creates metadata

Styling: same bg-void / bg-surface / neon-blue palette as the rest of the app.

## Settings — Vault Tab

New `vault` tab in SettingsPage (before `database`):

- **Vault name** — editable input, Save button → calls `vault.rename()` → app relaunches
- **Vault location** — read-only path + "Show in Finder" button → calls `vault.showInExplorer()`
- **Switch vault** — button that calls `app.relaunch()` to return to vault picker (main.ts handles this by not auto-selecting on next launch)

## api/client.ts — Dynamic Base URL

`window.electronAPI.apiBaseUrl` changes from a static string to null-before-vault-selection. The `request()` helper in `src/ui/api/client.ts` already reads `window.electronAPI?.apiBaseUrl ?? ''` at call time, so no change needed there — it simply won't be called until the vault is selected and the API is running.

## What Does NOT Change

- `src/core/` — untouched
- `src/db/` repositories, mappers, Prisma schema — untouched
- `src/api/` routes, middleware, bootstrap — untouched
- All existing API endpoints — untouched
- The encryption key infrastructure in main.ts — stays in userData, not in vault

## TypeScript Shared Types

`src/electron/vaultTypes.ts` — shared between main process and preload/renderer:

```ts
export interface VaultEntry {
  path: string
  name: string
  lastOpened: string  // ISO 8601
}

export interface VaultState {
  apiPort: number | null
  vaultName: string | null
  vaultPath: string | null
}
```

## File Map

| File | Action |
|---|---|
| `src/electron/vaultTypes.ts` | Create — shared types |
| `src/electron/vaultManager.ts` | Create — registry + filesystem operations |
| `src/electron/main.ts` | Modify — vault-aware startup, IPC handlers |
| `src/electron/preload.ts` | Modify — expose vault IPC namespace |
| `src/ui/pages/VaultPickerPage.tsx` | Create — launch vault selection screen |
| `src/ui/App.tsx` | Modify — render VaultPickerPage when no apiBaseUrl |
| `src/ui/pages/SettingsPage.tsx` | Modify — add vault tab |

## Open Questions (resolved)

**Should vault picker show even with one vault?** Yes — always. The user explicitly wants this for transparency.

**Where does the encryption key live?** In `userData/.db.key`, not in the vault. Keeps the vault portable and movable without exposing key material.

**What happens on vault rename — restart required?** Yes. The database connection must be re-established with the new path. `app.relaunch()` + `app.exit(0)` restarts the app cleanly. The user sees the vault picker again and opens the (now-renamed) vault in one click.

**Does web/Vite mode need changes?** No. `window.electronAPI` is undefined in web mode, so the vault picker never renders and the app behaves as before.
