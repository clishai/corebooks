import { contextBridge, ipcRenderer } from 'electron'
import type { VaultState } from './vaultTypes.js'

export interface VaultFileEntry {
  folder: string
  name: string
  path: string
  size: number
  mtime: number
}

export interface FileAddedEvent {
  folder: string
  name: string
  path: string
  size: number
  hint: 'import' | 'misplaced' | 'filed'
}

const vaultState = ipcRenderer.sendSync('vault:getState') as VaultState

contextBridge.exposeInMainWorld('electronAPI', {
  apiBaseUrl: vaultState.apiPort ? `http://127.0.0.1:${vaultState.apiPort}` : null,
  vault: {
    getState: (): VaultState => ipcRenderer.sendSync('vault:getState') as VaultState,
    list: () => ipcRenderer.invoke('vault:list'),
    create: (name: string, dirPath: string) => ipcRenderer.invoke('vault:create', name, dirPath),
    select: (dirPath: string) => ipcRenderer.invoke('vault:select', dirPath) as Promise<{ needsPassword: boolean }>,
    unlock: (password: string) => ipcRenderer.invoke('vault:unlock', password),
    rename: (newName: string) => ipcRenderer.invoke('vault:rename', newName),
    showInExplorer: () => ipcRenderer.invoke('vault:showInExplorer'),
    chooseDirectory: () => ipcRenderer.invoke('vault:chooseDirectory'),
    onReady: (cb: () => void) => {
      ipcRenderer.on('vault:ready', cb)
      return () => ipcRenderer.removeListener('vault:ready', cb)
    },
    relaunch: () => ipcRenderer.invoke('vault:relaunch'),
    listImports: () => ipcRenderer.invoke('vault:listImports'),
    listVaultFiles: () => ipcRenderer.invoke('vault:listVaultFiles'),
    moveFile: (srcPath: string, targetFolder: string) => ipcRenderer.invoke('vault:moveFile', srcPath, targetFolder),
    deleteFile: (filePath: string) => ipcRenderer.invoke('vault:deleteFile', filePath),
    readFile: (filePath: string) => ipcRenderer.invoke('vault:readFile', filePath),
    onFileAdded: (cb: (event: FileAddedEvent) => void) => {
      const listener = (_e: Electron.IpcRendererEvent, payload: FileAddedEvent) => cb(payload)
      ipcRenderer.on('vault:file-added', listener)
      return () => ipcRenderer.removeListener('vault:file-added', listener)
    },
    onFileRemoved: (cb: (event: { path: string }) => void) => {
      const listener = (_e: Electron.IpcRendererEvent, payload: { path: string }) => cb(payload)
      ipcRenderer.on('vault:file-removed', listener)
      return () => ipcRenderer.removeListener('vault:file-removed', listener)
    },
    safeStorageAvailable: () => ipcRenderer.invoke('vault:safeStorageAvailable'),
    getDefaultBase: () => ipcRenderer.invoke('vault:getDefaultBase'),
    setSkipUntil: (until: string | null) => ipcRenderer.invoke('vault:setSkipUntil', until),
    getSkipUntil: () => ipcRenderer.invoke('vault:getSkipUntil'),
    getEncryptionStatus: () => ipcRenderer.invoke('vault:getEncryptionStatus'),
    setupEncryption: (password: string) => ipcRenderer.invoke('vault:setupEncryption', password),
    verifyPassword: (password: string) => ipcRenderer.invoke('vault:verifyPassword', password),
    changePassword: (oldPassword: string, newPassword: string) => ipcRenderer.invoke('vault:changePassword', oldPassword, newPassword),
    removeEncryption: (password: string) => ipcRenderer.invoke('vault:removeEncryption', password),
    regenerateRecovery: (password: string) => ipcRenderer.invoke('vault:regenerateRecovery', password),
    resetPasswordAfterRecovery: (words: string[], newPassword: string) =>
      ipcRenderer.invoke('vault:resetPasswordAfterRecovery', words, newPassword),
  },
  ollama: {
    start: () => ipcRenderer.invoke('ollama:start'),
  },
})
