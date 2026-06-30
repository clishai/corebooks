import { contextBridge, ipcRenderer } from 'electron'

// Read the API URL once at preload time. After a vault is opened, the main
// process emits 'vault:ready' and the renderer reloads — which fires preload
// again and picks up the new port via this sync IPC.
const apiBaseUrl = ipcRenderer.sendSync('vault:getApiBaseUrl') as string | null

contextBridge.exposeInMainWorld('electronAPI', {
  apiBaseUrl,
  vault: {
    list: () => ipcRenderer.invoke('vault:list'),
    create: (args: unknown) => ipcRenderer.invoke('vault:create', args),
    open: (args: unknown) => ipcRenderer.invoke('vault:open', args),
    close: () => ipcRenderer.invoke('vault:close'),
    switchTo: (args: unknown) => ipcRenderer.invoke('vault:switch', args),
    unlockWithRecovery: (args: unknown) => ipcRenderer.invoke('vault:unlockWithRecovery', args),
    confirmDefaultSettings: () => ipcRenderer.invoke('vault:confirmDefaultSettings'),
    chooseDirectory: () => ipcRenderer.invoke('vault:chooseDirectory'),
    showInExplorer: (p: string) => ipcRenderer.invoke('vault:showInExplorer', p),
    migrateLegacy: (args: unknown) => ipcRenderer.invoke('vault:migrateLegacy', args),
    enableBiometric: () => ipcRenderer.invoke('vault:enableBiometric'),
    disableBiometric: () => ipcRenderer.invoke('vault:disableBiometric'),
    isBiometricAvailable: () => ipcRenderer.invoke('vault:isBiometricAvailable'),
    listImports: () => ipcRenderer.invoke('vault:listImports'),
    listVaultFiles: () => ipcRenderer.invoke('vault:listVaultFiles'),
    moveFile: (srcPath: string, targetFolder: string) =>
      ipcRenderer.invoke('vault:moveFile', srcPath, targetFolder),
    deleteFile: (filePath: string) => ipcRenderer.invoke('vault:deleteFile', filePath),
    readFile: (filePath: string) => ipcRenderer.invoke('vault:readFile', filePath),
    onFileAdded: (cb: (event: unknown) => void) => {
      const listener = (_e: unknown, payload: unknown) => cb(payload)
      ipcRenderer.on('vault:file-added', listener as never)
      return () => ipcRenderer.removeListener('vault:file-added', listener as never)
    },
    onFileRemoved: (cb: (event: unknown) => void) => {
      const listener = (_e: unknown, payload: unknown) => cb(payload)
      ipcRenderer.on('vault:file-removed', listener as never)
      return () => ipcRenderer.removeListener('vault:file-removed', listener as never)
    },
    getDefaultBase: () => ipcRenderer.invoke('vault:getDefaultBase'),
    onReady: (cb: () => void) => {
      ipcRenderer.on('vault:ready', cb)
      return () => ipcRenderer.removeListener('vault:ready', cb)
    },
  },
})
