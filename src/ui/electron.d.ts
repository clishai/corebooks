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
        select: (dirPath: string) => Promise<{ needsPassword: boolean }>
        unlock: (password: string) => Promise<void>
        rename: (newName: string) => Promise<{ newPath: string }>
        showInExplorer: () => Promise<void>
        chooseDirectory: () => Promise<string | null>
        onReady: (cb: () => void) => () => void
        relaunch: () => Promise<void>
        listImports: () => Promise<VaultFileEntry[]>
        listVaultFiles: () => Promise<VaultFileEntry[]>
        moveFile: (srcPath: string, targetFolder: string) => Promise<string>
        deleteFile: (filePath: string) => Promise<void>
        readFile: (filePath: string) => Promise<string>
        onFileAdded: (cb: (event: FileAddedEvent) => void) => () => void
        onFileRemoved: (cb: (event: { path: string }) => void) => () => void
        safeStorageAvailable: () => Promise<boolean>
        getDefaultBase: () => Promise<string>
        setSkipUntil: (until: string | null) => Promise<void>
        getSkipUntil: () => Promise<string | null>
        getEncryptionStatus: () => Promise<{ encrypted: boolean }>
        setupEncryption: (password: string) => Promise<{ phraseWords: string[] }>
        verifyPassword: (password: string) => Promise<boolean>
        changePassword: (oldPassword: string, newPassword: string) => Promise<void>
        removeEncryption: (password: string) => Promise<void>
        regenerateRecovery: (password: string) => Promise<{ phraseWords: string[] }>
        resetPasswordAfterRecovery: (words: string[], newPassword: string) => Promise<void>
      }
    }
  }
}
