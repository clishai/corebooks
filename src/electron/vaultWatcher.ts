import chokidar, { FSWatcher } from 'chokidar'
import fs from 'fs'
import path from 'path'
import type { BrowserWindow } from 'electron'

export type FileHint = 'import' | 'misplaced' | 'filed'

export interface FileAddedPayload {
  folder: string
  name: string
  path: string
  size: number
  hint: FileHint
}

const IMPORTABLE_EXTS = new Set(['.csv', '.iif', '.json'])
const KNOWN_SUBDIRS = new Set(['imports', 'statements', 'receipts', 'exports'])

export function classifyFile(
  vaultPath: string,
  filePath: string,
): { folder: string; hint: FileHint } {
  const rel = path.relative(vaultPath, filePath)
  const parts = rel.split(path.sep)
  const ext = path.extname(filePath).toLowerCase()

  if (parts.length === 1) {
    return { folder: '', hint: 'misplaced' }
  }

  const folder = parts[0]!

  if (folder === 'imports') {
    return { folder, hint: 'import' }
  }

  if (KNOWN_SUBDIRS.has(folder)) {
    return { folder, hint: IMPORTABLE_EXTS.has(ext) ? 'misplaced' : 'filed' }
  }

  return { folder, hint: 'misplaced' }
}

export class VaultWatcher {
  private watcher: FSWatcher | null = null

  start(vaultPath: string, win: BrowserWindow): void {
    this.stop()

    const ignored = [
      path.join(vaultPath, 'corebooks.db'),
      path.join(vaultPath, 'corebooks.db-journal'),
      path.join(vaultPath, 'corebooks.db-wal'),
      path.join(vaultPath, '.corebooks'),
    ]

    this.watcher = chokidar.watch(vaultPath, {
      ignoreInitial: true,
      depth: 1,
      ignored,
      awaitWriteFinish: {
        stabilityThreshold: 2000,
        pollInterval: 100,
      },
    })

    this.watcher.on('add', (filePath: string) => {
      const { folder, hint } = classifyFile(vaultPath, filePath)
      if (hint === 'filed') return

      let size = 0
      try { size = fs.statSync(filePath).size } catch { /* ignore */ }

      const payload: FileAddedPayload = {
        folder,
        name: path.basename(filePath),
        path: filePath,
        size,
        hint,
      }
      win.webContents.send('vault:file-added', payload)
    })

    this.watcher.on('unlink', (filePath: string) => {
      win.webContents.send('vault:file-removed', { path: filePath })
    })
  }

  stop(): void {
    this.watcher?.close()
    this.watcher = null
  }
}
