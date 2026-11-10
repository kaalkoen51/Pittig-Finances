/**
 * The API that electron/preload.ts exposes on `window.pittig` via contextBridge.
 * FROZEN CONTRACT between the renderer (src/storage/electronStorage.ts) and the Electron agent.
 *
 * The main process works with raw JSON *text* only; parsing, migration and validation happen in
 * the renderer (src/domain/migrate.ts). Paths (per plan revisions):
 *   live data:  app.getPath('userData')/pittig-data.json   (atomic: tmp + rename, retry 5x on EBUSY/EPERM)
 *   backups:    Documents/Pittig Finances/Backups/pittig-backup-YYYY-MM-DD.json (daily, keep 30)
 *               + pittig-backup-YYYY-MM-DD-HHmmss-<reason>.json for non-daily reasons.
 * The main process makes the 'daily' backup itself on startup (copy of the live file, if any).
 */
import type { BackupInfo, BackupReason, UpdateCheckResult } from './types';

export interface PittigBridgeInfo {
  dataPath: string;
  backupDir: string;
  appVersion: string;
  platform: string; // process.platform
}

export interface PittigBridge {
  /** Static info, available synchronously (preload gets it via ipcRenderer.sendSync). */
  info: PittigBridgeInfo;

  /** Read the live data file. Rejects only on I/O errors other than "not found". */
  readData(): Promise<{ exists: false } | { exists: true; text: string }>;
  /**
   * Atomically write the live data file. Main must refuse (reject) to write when `text` is not
   * valid JSON. Resolves with the time written.
   */
  writeData(text: string): Promise<{ savedAt: string }>;

  /** Copy the current live file (raw bytes, even if corrupt) into the backup folder; prunes old dailies. */
  backupNow(reason: BackupReason): Promise<BackupInfo>;
  /** Newest first. */
  listBackups(): Promise<BackupInfo[]>;
  /** Raw text of a backup file by id (file name). */
  readBackup(id: string): Promise<string>;

  /** Show a save dialog and write `text`. */
  exportBackupFile(text: string, suggestedName: string): Promise<{ saved: boolean; path?: string }>;
  /** Show an open dialog (*.json) and return the file text. */
  importBackupFile(): Promise<{ canceled: true } | { canceled: false; text: string; path: string }>;
  /** Show a save dialog and write bytes (used for Excel export). */
  saveFile(bytes: Uint8Array, suggestedName: string, filters: { name: string; extensions: string[] }[]): Promise<{ saved: boolean; path?: string }>;

  /** Open the folder containing the data file / backups in Explorer. */
  openDataFolder(): Promise<void>;

  /** electron-updater check; must never reject (return { status: 'error' }). */
  checkForUpdates(): Promise<UpdateCheckResult>;

  /**
   * Close handshake: main sends 'pittig:before-close' when the window is closing; preload calls
   * every registered callback, awaits them, then sends 'pittig:close-ready'. Main waits (max ~3 s)
   * for that before really closing. Returns an unsubscribe function.
   */
  onBeforeClose(cb: () => Promise<void> | void): () => void;
}

/** IPC channel names shared by preload.ts and main.ts. */
export const IPC = {
  info: 'pittig:info', // sendSync → PittigBridgeInfo
  readData: 'pittig:read-data',
  writeData: 'pittig:write-data',
  backupNow: 'pittig:backup-now',
  listBackups: 'pittig:list-backups',
  readBackup: 'pittig:read-backup',
  exportBackupFile: 'pittig:export-backup-file',
  importBackupFile: 'pittig:import-backup-file',
  saveFile: 'pittig:save-file',
  openDataFolder: 'pittig:open-data-folder',
  checkForUpdates: 'pittig:check-for-updates',
  beforeClose: 'pittig:before-close', // main → renderer
  closeReady: 'pittig:close-ready', // renderer → main
} as const;

declare global {
  interface Window {
    /** Present only inside the Electron shell. */
    pittig?: PittigBridge;
  }
}
