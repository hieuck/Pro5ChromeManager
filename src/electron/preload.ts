import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS, PRELOAD_FALLBACK_VERSION, PRELOAD_GLOBAL_KEY } from './constants';

// Minimal preload - contextIsolation enabled, no Node.js APIs exposed to renderer.
// The UI communicates with the backend via HTTP (localhost:3210), not IPC.
contextBridge.exposeInMainWorld(PRELOAD_GLOBAL_KEY, {
  version: process.env['npm_package_version'] ?? PRELOAD_FALLBACK_VERSION,
  installUpdate: () => ipcRenderer.invoke(IPC_CHANNELS.installUpdate),
});
