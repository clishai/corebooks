import { contextBridge, ipcRenderer } from 'electron'
import type { VaultState } from './vaultTypes.js'

const vaultState = ipcRenderer.sendSync('vault:getState') as VaultState

contextBridge.exposeInMainWorld('electronAPI', {
  apiBaseUrl: vaultState.apiPort ? `http://127.0.0.1:${vaultState.apiPort}` : null,
  vault: {
    getState: (): VaultState => ipcRenderer.sendSync('vault:getState') as VaultState,
    list: () => ipcRenderer.invoke('vault:list'),
    create: (name: string, dirPath: string) => ipcRenderer.invoke('vault:create', name, dirPath),
    select: (dirPath: string) => ipcRenderer.invoke('vault:select', dirPath),
    rename: (newName: string) => ipcRenderer.invoke('vault:rename', newName),
    showInExplorer: () => ipcRenderer.invoke('vault:showInExplorer'),
    chooseDirectory: () => ipcRenderer.invoke('vault:chooseDirectory'),
    onReady: (cb: () => void) => { ipcRenderer.on('vault:ready', cb) },
    relaunch: () => ipcRenderer.invoke('vault:relaunch'),
  },
})
