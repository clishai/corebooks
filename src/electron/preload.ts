import { contextBridge } from 'electron';

// The port is injected by the main process via additionalArguments.
const portArg = process.argv.find(a => a.startsWith('--api-port='));
const apiPort = portArg ? parseInt(portArg.split('=')[1] ?? '3000', 10) : 3000;

contextBridge.exposeInMainWorld('electronAPI', {
  apiBaseUrl: `http://127.0.0.1:${apiPort}`,
});
