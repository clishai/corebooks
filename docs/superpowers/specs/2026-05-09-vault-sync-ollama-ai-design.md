# Vault File Sync + Ollama AI Integration — Design Spec
**Date:** 2026-05-09
**Status:** Approved

---

## Overview

Two features built together because they share infrastructure:

1. **Vault file sync** — the app watches the vault folder on disk. Files dropped in from the OS appear in the app immediately, with smart guidance if they land in the wrong subfolder.
2. **Ollama AI panel** — an optional, fully local AI assistant panel in the workspace, powered by a user-installed Ollama instance. No accounts, no cloud, no internet required for inference.

Additionally: the **Home settings tab** is renamed **General**, and **reminder frequency** becomes a single global setting shared by all reminder types across the app.

---

## Section 1 — Vault File Watching

### Dependency

Add `chokidar` to the project. Used only in the Electron main process. Provides native OS file watchers on all three platforms (FSEvents/macOS, ReadDirectoryChangesW/Windows, inotify/Linux). No polling.

### What gets watched

A single `chokidar.watch(vaultPath, { ignoreInitial: true, depth: 1 })` instance covers the entire vault — all four subdirs (`imports/`, `statements/`, `receipts/`, `exports/`) and the vault root. Depth 1 prevents recursing into nested folders and avoids watching `corebooks.db` or `.corebooks` metadata.

The watcher starts inside `startApiForVault()` after a vault is selected and stops cleanly when the vault changes or the app quits.

### Smart routing

When a file arrives, the main process classifies it before notifying the renderer:

| Location | Extension | Hint |
|---|---|---|
| `imports/` | any | `'import'` |
| `statements/`, `receipts/`, `exports/` | `.csv`, `.iif`, `.json` | `'misplaced'` |
| `statements/`, `receipts/`, `exports/` | `.pdf`, `.png`, `.jpg`, etc. | `'filed'` |
| Vault root | any | `'misplaced'` |

`'filed'` fires no notification. The renderer acts only on `'import'` and `'misplaced'`.

### New IPC surface

Added to `main.ts` and exposed via `preload.ts`:

| IPC | Type | Returns |
|---|---|---|
| `vault:listImports` | invoke | `{ name, size, mtime }[]` — files in `imports/` |
| `vault:listVaultFiles` | invoke | `{ folder, name, size, mtime }[]` — all four subdirs |
| `vault:moveFile` | invoke | moves a file between vault subdirs on disk |
| `vault:deleteFile` | invoke | deletes a file from the vault |
| `vault:file-added` | push event | `{ folder, name, path, size, hint }` — fires on new file arrival |

### UI — badge and toast

**`hint: 'import'`**
- Numeric badge appears on the Import Data button in DatabaseTab
- Toast: *"bank-statement.csv is ready to import"* with **Import now** link
- Badge persists until the file leaves `imports/`

**`hint: 'misplaced'`** (importable extension only)
- Toast: *"bank-statement.csv landed in statements/ — did you mean to import it?"*
- Two actions: **Import** and **Dismiss**
- Dismiss records a snooze timestamp for that file path using the global reminder frequency value (`getSnoozeDuration()` from `src/ui/lib/alerts.ts`)
- If the file is still present when the snooze expires and the app is running, the toast reappears

### ImportModal pre-load

`ImportModal` gains an optional prop:
```ts
preloadFile?: { name: string; path: string; content: ArrayBuffer }
```
When provided, the modal skips Step 1 (format/upload) and opens on Step 2 (CSV column mapping) or Step 3 (options) depending on format. The Electron main process reads the file via `fs.readFile` and passes content over IPC before the modal opens. The renderer never needs direct filesystem access.

### Post-import archive prompt

After a successful import, the result step of `ImportModal` adds a footer:

*"Archive the source file?"*

Three buttons: **Move to statements/** · **Leave in imports/** · **Delete**

These call `vault:moveFile` or `vault:deleteFile`. If the user closes without choosing, the file stays where it is — no silent side effects.

### Vault Files panel (VaultTab)

A collapsible "Vault contents" section added below the existing rename/location/switch controls in `VaultTab.tsx`. Lists files from all four subdirs in a simple table: name, folder, size, date. Each row has context actions:
- Importable files: **Import** button
- All files: **Move** (folder picker dropdown) and **Delete**

Folder purpose descriptions appear as tooltips so users always know what each folder is for.

---

## Section 2 — General Tab + Global Reminder Frequency

### HomeTab → GeneralTab

`src/ui/pages/settings/HomeTab.tsx` is renamed to `GeneralTab.tsx`. The tab label in `SettingsPage` changes from `home` to `general`. No content is removed — business name, metric card size, visible metrics, and reminder frequency all stay.

### Global reminder frequency

The "Alert reminders" section in `GeneralTab` is relabeled **"Reminder frequency"**. The same `saveSnoozeDuration` / `getSnoozeDuration` localStorage value (`cb_snooze_duration`) is now the single source of truth for all reminder snooze behaviour across the entire app:

- Home page alerts (existing)
- Misplaced vault file re-notifications (new)
- Any future reminder type

No new storage keys. No per-feature snooze — one setting, everything obeys it.

---

## Section 3 — Ollama AI Panel + Settings Tab

### Overview

AI in corebooks is split into two pieces:
- **Settings → AI tab** — configuration (endpoint, model, enable/disable, setup guide)
- **AI side panel** — the workspace interaction surface, toggled from the toolbar

### Feature flag

`cb_ai_enabled` in localStorage (boolean, default `false`). Until enabled, AI panel interactions show the "not enabled" popover.

### AI toolbar button

Located at the far right of the top toolbar in `Layout.tsx`.

**States:**

| State | Button appearance |
|---|---|
| AI not enabled | `AI (Beta)` — no dot |
| AI enabled, Ollama not running | `● AI (Beta)` — red dot |
| AI enabled, Ollama connected | `● AI (Beta)` — green dot |

The dot is a small inline circle rendered before the label text. Green = `bg-emerald-400`, red = `bg-red-400`.

**Background connection check:** When AI is enabled, a silent ping to `http://<endpoint>/api/tags` (2-second timeout) runs every 60 seconds and immediately when the app window gains focus. This keeps the dot current without user interaction.

### Toolbar button click behaviour (three states)

**State 1 — AI not enabled:**
A small popover fades in below the button (150ms opacity transition). The button and popover are visually connected — the button shifts to `bg-surface`, its bottom border dissolves, and the popover uses `rounded-t-none border-t-0` so they read as one unified element with a continuous `border border-rim` wrapping both.

Content:
> *AI features are not currently enabled.*
>
> [ Settings → ]

**Settings** routes to `/settings?tab=ai`.

**State 2 — AI enabled, Ollama not running:**
Same connected popover.

Content:
> *AI is not currently activated.*
>
> [ Activate ]

**Activate** (Electron): fires an IPC call that attempts `ollama serve` via `child_process.spawn`. Re-pings after a short delay. If Ollama comes up, the popover closes and the panel slides open. If it fails (not installed or times out), the popover transitions to:
> *Couldn't start Ollama — check your setup.*
> [ Settings → ]

**Activate** (web mode): routes directly to `/settings?tab=ai` — process spawning is not available.

**State 3 — AI enabled, Ollama running:**
No popover. The AI side panel slides open immediately (220ms transition).

**Popover design:** `bg-surface border border-rim rounded-lg shadow-2xl`, approximately `240px` wide, right-aligned to the button. Closes on outside click or Escape.

### AI side panel

A `<aside>` sibling to the `<main>` content area in `Layout.tsx`. Fixed width `320px`. Opens and closes with a `transition: width 220ms ease` so the workspace content smoothly compresses and expands. State persisted to `cb_ai_panel_open` in localStorage.

**Panel content (v1 — infrastructure shell):**

```
┌─────────────────────────────┐
│  AI (Beta)            ✕     │
├─────────────────────────────┤
│  ● Ollama connected         │
│    llama3.2                 │
├─────────────────────────────┤
│  Transaction categorisation │
│  and journal suggestions    │
│  are coming with bank feed  │
│  import.                    │
│                             │
│  Configure AI →             │
└─────────────────────────────┘
```

The connection status dot in the panel refreshes on panel open. "Configure AI →" links to `/settings?tab=ai`. No AI interaction logic in v1 — this panel is the shell that future features populate.

### Settings → AI tab

`src/ui/pages/settings/AITab.tsx`. Added to `SettingsPage` between `shortcuts` and `users`.

**When AI is disabled:**

Explanation card:
> AI assistance connects corebooks to a local Ollama model running on your machine. Your data never leaves your computer — there is no cloud, no account, and no subscription.

Setup guide (numbered, inline):
1. Download and install Ollama from **ollama.com** — free, no account required
2. Open Terminal and run: `ollama pull llama3.2` *(copyable code block)*
3. Ollama runs silently in the background — nothing else to configure
4. Come back here and click **Enable AI assistance**

> **Note:** The terminal step is a temporary limitation. A future release will handle Ollama installation and model downloads entirely within corebooks — no terminal required.

Single button: **Enable AI assistance**

**When AI is enabled:**

- **Connection status** — auto-checks on tab open, no blocking spinner. Green or red dot with message. **↺ Refresh** button beside it.
- **Model selector** — dropdown from `/api/tags`. Persisted to `cb_ai_model`. Disabled if Ollama not connected.
- **Endpoint field** — editable, default `http://localhost:11434`, persisted to `cb_ai_endpoint`. Changes trigger a re-check after 500ms debounce.
- **Disable link** — small muted *"Disable AI assistance"* at the bottom. No confirmation modal.

### `src/ui/lib/ollama.ts`

New thin module. Three exports:
```ts
checkOllama(endpoint: string): Promise<{ connected: boolean; models: string[] }>
getOllamaConfig(): { enabled: boolean; endpoint: string; model: string | null }
saveOllamaConfig(config: Partial<OllamaConfig>): void
```

The AI tab and the toolbar button both import from here. No server-side proxy — the renderer fetches Ollama directly (no CORS issues in Electron; Ollama sets permissive CORS headers so web mode works too).

---

## Section 4 — Cross-Platform Compatibility

**Goal:** Each user on their own OS gets a complete, clean experience. Mac users get `.dmg`, Windows users get `.exe`, Linux users get `.AppImage`. Nothing exotic — just making sure everything that already works on macOS also works on the other two.

### Changes required

| Item | What changes |
|---|---|
| `chokidar` | Replaces `fs.watch` — handles all three platforms correctly |
| `safeStorage` fallback | Guard with `safeStorage.isEncryptionAvailable()` at startup. If false (can happen on minimal Linux setups without a keyring), skip encryption and show a one-time amber warning in VaultTab: *"OS keychain unavailable — encryption key stored unprotected. Install libsecret to enable encryption."* |
| JetBrains Mono | Bundle WOFF2 font files in `src/ui/assets/fonts/` with `@font-face` declarations. Removes dependency on any system font or CDN — required for a fully offline `.AppImage`. |
| Ollama spawn (Electron) | Wrap `child_process.spawn` call with platform-aware binary name: `ollama` on Mac/Linux, `ollama.exe` on Windows. |
| `electron-builder` config | Verify all three targets are declared: `.dmg` (macOS), NSIS `.exe` (Windows), `.AppImage` + `.deb` (Linux). Verify `nativeRebuilder` config for `better-sqlite3`. |

---

## Files changed / created

### New files
- `src/electron/vaultWatcher.ts` — chokidar watcher class, classification logic
- `src/ui/lib/ollama.ts` — connection check, config helpers
- `src/ui/pages/settings/AITab.tsx` — AI configuration tab
- `src/ui/pages/settings/GeneralTab.tsx` — renamed from HomeTab
- `src/ui/components/AIPanel.tsx` — right-side workspace panel shell
- `src/ui/components/AIButtonPopover.tsx` — connected dropdown for disabled/offline states
- `src/ui/assets/fonts/` — JetBrains Mono WOFF2 files

### Modified files
- `src/electron/main.ts` — add watcher lifecycle, new IPC handlers, safeStorage guard, Ollama spawn
- `src/electron/preload.ts` — expose new vault IPC surface
- `src/ui/electron.d.ts` — type new IPC methods
- `src/ui/pages/SettingsPage.tsx` — add AI tab, rename Home → General
- `src/ui/pages/settings/DatabaseTab.tsx` — badge on Import button, pre-load prop for ImportModal
- `src/ui/pages/settings/VaultTab.tsx` — add Vault Files panel
- `src/ui/components/ImportModal.tsx` — add `preloadFile` prop, post-import archive prompt
- `src/ui/components/Layout.tsx` — AI panel aside, AI toolbar button, status dot, background ping
- `src/ui/lib/alerts.ts` — rename section label to "Reminder frequency", confirm global scope
- `src/ui/index.css` — `@font-face` declarations for bundled JetBrains Mono

### Deleted files
- `src/ui/pages/settings/HomeTab.tsx` — replaced by GeneralTab.tsx

---

## Out of scope (future phases)

- In-app Ollama installer (eliminates terminal step entirely)
- Actual AI interaction logic (transaction categorisation, journal suggestions)
- AI interaction rules and write-access boundaries
- File manager page (deferred — OS file manager + Vault Files panel is sufficient for now)
- Plugin marketplace
- Watching `receipts/` for linked-receipt workflows (Phase TBD)
