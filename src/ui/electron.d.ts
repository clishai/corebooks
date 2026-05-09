import type { VaultEntry, VaultState } from '../electron/vaultTypes'

export {}

interface VaultFileEntry {
  folder: string
  name: string
  path: string
  size: number
  mtime: number
}

interface FileAddedEvent {
  folder: string
  name: string
  path: string
  size: number
  hint: 'import' | 'misplaced' | 'filed'
}

declare global {
  interface Window {
    electronAPI?: {
      apiBaseUrl: string | null
      vault: {
        getState: () => VaultState
        list: () => Promise<VaultEntry[]>
        create: (name: string, dirPath: string) => Promise<VaultEntry>
        select: (dirPath: string) => Promise<void>
        rename: (newName: string) => Promise<{ newPath: string }>
        showInExplorer: () => Promise<void>
        chooseDirectory: () => Promise<string | null>
        onReady: (cb: () => void) => void
        relaunch: () => Promise<void>
        listImports: () => Promise<VaultFileEntry[]>
        listVaultFiles: () => Promise<VaultFileEntry[]>
        moveFile: (srcPath: string, targetFolder: string) => Promise<string>
        deleteFile: (filePath: string) => Promise<void>
        readFile: (filePath: string) => Promise<string>
        onFileAdded: (cb: (event: FileAddedEvent) => void) => void
        onFileRemoved: (cb: (event: { path: string }) => void) => void
      }
      ollama: {
        start: () => Promise<boolean>
      }
    }
  }
}
