import { contextBridge, ipcRenderer } from 'electron';

// Minimal preload — contextIsolation enabled, no Node.js APIs exposed to renderer.
// The UI communicates with the backend via HTTP (localhost:3210), not IPC.
contextBridge.exposeInMainWorld('__pro5__', {
  version: process.env['npm_package_version'] ?? '1.0.0',
  installUpdate: () => ipcRenderer.invoke('pro5:update-install'),
});
