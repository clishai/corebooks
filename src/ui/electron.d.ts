export {}

export interface ActiveVault {
  id: string
  path: string
  displayName: string
  apiPort: number
}

export interface PickerEntry {
  id: string
  path: string
  displayName: string
  lastOpened: string
}

export type OpenResult =
  | { status: 'opened'; vault: ActiveVault }
  | { status: 'needs-password' }
  | { status: 'needs-settings-confirmation'; defaults: Record<string, unknown> }
  | { status: 'busy'; lockedByPid: number }
  | { status: 'identity-mismatch' }
  | { status: 'lock-tampered' }
  | { status: 'legacy-needs-migration' }

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
        list(): Promise<PickerEntry[]>
        create(args: { directory: string; displayName: string; password: string }): Promise<{ vault: ActiveVault; recoveryPhrase: string }>
        open(args: { path: string; password?: string }): Promise<OpenResult>
        close(): Promise<void>
        switchTo(args: { path: string; password: string }): Promise<OpenResult>
        unlockWithRecovery(args: { path: string; phrase: string; newPassword: string }): Promise<OpenResult>
        confirmDefaultSettings(): Promise<void>
        chooseDirectory(): Promise<string | null>
        showInExplorer(vaultPath: string): Promise<void>
        migrateLegacy(args: { path: string; password: string }): Promise<{ recoveryPhrase: string }>
        listImports(): Promise<Array<{ name: string; path: string; size: number; mtime: number }>>
        listVaultFiles(): Promise<VaultFileEntry[]>
        moveFile(srcPath: string, targetFolder: string): Promise<string>
        deleteFile(filePath: string): Promise<void>
        readFile(filePath: string): Promise<string>
        onFileAdded(cb: (event: FileAddedEvent) => void): () => void
        onFileRemoved(cb: (event: { path: string }) => void): () => void
        getDefaultBase(): Promise<string>
        onReady(cb: () => void): () => void
      }
    }
  }
}
