import type { VaultEntry, VaultState } from '../electron/vaultTypes'

export {}

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
      }
    }
  }
}
