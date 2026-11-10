/**
 * Storage contract. FROZEN: implemented by idbStorage.ts (web/PWA) and electronStorage.ts (Windows).
 * The store (src/state/store.tsx) is the only regular caller; Settings/Recovery screens may call
 * backup/restore/info methods through `useStorage()`.
 */
import type { AppData, ISODateTime } from '../domain/types';

export type LoadResult =
  /** Valid data. `migratedFrom` is set when an older version was upgraded (a backup was made first). */
  | { status: 'ok'; data: AppData; migratedFrom?: number }
  /** Nothing stored yet (first run). The store starts with `emptyData()`. */
  | { status: 'empty' }
  /** Data exists but cannot be parsed/validated → recovery mode. Nothing is overwritten. */
  | { status: 'corrupt'; error: string };

export type BackupReason =
  | 'daily' // first use of the day
  | 'manual' // "Backup now"
  | 'pre-migration'
  | 'pre-restore' // before restoreBackup / importBackupFile replace the data
  | 'pre-import' // before an Excel import changes data
  | 'pre-replace'; // before replaceAll (e.g. load demo data)

export interface BackupInfo {
  /** Opaque id; pass to restoreBackup(). Electron: file name, e.g. "pittig-backup-2026-03-12.json". */
  id: string;
  createdAt: ISODateTime;
  reason: BackupReason;
  sizeBytes?: number;
  /** Full path on disk (Electron only). */
  path?: string;
}

export type RestoreResult = { ok: true; data: AppData } | { ok: false; error: string };

export interface StorageInfo {
  kind: 'electron' | 'web';
  /** Electron: full path of pittig-data.json. */
  dataPath?: string;
  /** Electron: folder with backups. */
  backupDir?: string;
}

export type UpdateCheckResult =
  | { status: 'up-to-date'; version: string }
  | { status: 'available'; version: string } // downloading in background, installs on quit
  | { status: 'downloaded'; version: string }
  | { status: 'unsupported' } // e.g. dev build
  | { status: 'error'; message: string };

export interface Storage {
  /** Read + migrate + validate. Never throws for bad content (returns 'corrupt'); may throw on I/O failure. */
  load(): Promise<LoadResult>;
  /** Persist the whole dataset now (atomic on Electron). The store debounces calls (300 ms). */
  save(data: AppData): Promise<void>;
  /** Resolves when all pending/in-flight saves are written. */
  flush(): Promise<void>;
  /** Copy the currently stored data (raw, even if corrupt) into a new backup. */
  backupNow(reason?: BackupReason): Promise<BackupInfo>;
  /** Newest first. */
  listBackups(): Promise<BackupInfo[]>;
  /** Read and validate a backup. Does NOT write it as live data – the store does that via replaceAll. */
  restoreBackup(id: string): Promise<RestoreResult>;
  /** Let the user save a JSON backup file (download on web, save dialog on Electron). false = cancelled. */
  exportBackupFile(data: AppData): Promise<boolean>;
  /**
   * Read + validate a backup file chosen by the user. Web: pass the File from an <input type=file>.
   * Electron: call without a file to show an open dialog. null = cancelled.
   */
  importBackupFile(file?: File): Promise<RestoreResult | null>;
  /** Save arbitrary bytes (e.g. the Excel export). Download on web, save dialog on Electron. false = cancelled. */
  saveFile(bytes: Uint8Array | ArrayBuffer | Blob, suggestedName: string, mimeType: string): Promise<boolean>;
  /** Electron only: open the data/backups folder in Explorer. */
  openDataFolder?(): Promise<void>;
  info(): StorageInfo;
  /** Electron only. */
  appVersion?(): string;
  /** Electron only. Never throws. */
  checkForUpdates?(): Promise<UpdateCheckResult>;
  /**
   * Register a callback the shell calls before the window closes (Electron) / page unloads.
   * The store registers its flush here. Returns an unsubscribe function.
   */
  onBeforeClose(cb: () => Promise<void> | void): () => void;
}
