/**
 * Preload: exposes `window.pittig` (PittigBridge, see src/storage/electronApi.ts) via contextBridge.
 * contextIsolation: true, nodeIntegration: false, sandbox: true.
 */
import { contextBridge, ipcRenderer } from 'electron';
import { IPC, type PittigBridge, type PittigBridgeInfo } from '../src/storage/electronApi';
import { runCloseCallbacks } from './closeGuard';

const closeCallbacks = new Set<() => Promise<void> | void>();

ipcRenderer.on(IPC.beforeClose, async () => {
  // Reports whether the flush succeeded; main asks before closing with unsaved changes.
  ipcRenderer.send(IPC.closeReady, await runCloseCallbacks(closeCallbacks));
});

const bridge: PittigBridge = {
  info: ipcRenderer.sendSync(IPC.info) as PittigBridgeInfo,
  readData: () => ipcRenderer.invoke(IPC.readData),
  writeData: (text) => ipcRenderer.invoke(IPC.writeData, text),
  backupNow: (reason) => ipcRenderer.invoke(IPC.backupNow, reason),
  listBackups: () => ipcRenderer.invoke(IPC.listBackups),
  readBackup: (id) => ipcRenderer.invoke(IPC.readBackup, id),
  exportBackupFile: (text, name) => ipcRenderer.invoke(IPC.exportBackupFile, text, name),
  importBackupFile: () => ipcRenderer.invoke(IPC.importBackupFile),
  saveFile: (bytes, name, filters) => ipcRenderer.invoke(IPC.saveFile, bytes, name, filters),
  openDataFolder: () => ipcRenderer.invoke(IPC.openDataFolder),
  checkForUpdates: () => ipcRenderer.invoke(IPC.checkForUpdates),
  onBeforeClose: (cb) => {
    closeCallbacks.add(cb);
    return () => closeCallbacks.delete(cb);
  },
};

contextBridge.exposeInMainWorld('pittig', bridge);
