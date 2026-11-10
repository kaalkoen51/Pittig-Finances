/**
 * Web / PWA storage: IndexedDB on this device only.
 * DB "pittig-finances" v1, object stores:
 *   kv       – key 'data' → { text: string (JSON), savedAt: ISODateTime }
 *   backups  – keyPath 'id' → { id, createdAt, reason, text, sizeBytes }
 * Daily backup on first load of the day (keep 30), other backups keep 20.
 */
import { hasUserContent } from '../domain/calc';
import { today } from '../domain/dates';
import { newId } from '../domain/ids';
import { parseAppData, serializeAppData } from '../domain/migrate';
import type { AppData } from '../domain/types';
import { backupFileName, downloadBlob, toBlob } from './download';
import type { BackupInfo, BackupReason, LoadResult, RestoreResult, Storage, StorageInfo } from './types';
import { WriteQueue } from './writeQueue';

const DB_NAME = 'pittig-finances';
const DB_VERSION = 1;
const KV = 'kv';
const BACKUPS = 'backups';
const DATA_KEY = 'data';
const KEEP_DAILY = 30;
const KEEP_OTHER = 20;

interface DataRecord {
  text: string;
  savedAt: string;
}
interface BackupRecord extends BackupInfo {
  text: string;
  /** Copy of stored data that failed validation (e.g. before a restore in recovery mode). Never listed. */
  damaged?: true;
}

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'));
  });
}

export class IdbStorage implements Storage {
  private dbp: Promise<IDBDatabase> | null = null;
  private queue = new WriteQueue();
  private closeCbs = new Set<() => Promise<void> | void>();

  constructor(private dbName: string = DB_NAME) {}

  private db(): Promise<IDBDatabase> {
    if (!this.dbp) {
      this.dbp = new Promise((resolve, reject) => {
        const open = indexedDB.open(this.dbName, DB_VERSION);
        open.onupgradeneeded = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains(KV)) db.createObjectStore(KV);
          if (!db.objectStoreNames.contains(BACKUPS)) db.createObjectStore(BACKUPS, { keyPath: 'id' });
        };
        open.onsuccess = () => resolve(open.result);
        open.onerror = () => reject(open.error);
      });
    }
    return this.dbp;
  }

  private async readRecord(): Promise<DataRecord | undefined> {
    const db = await this.db();
    return req(db.transaction(KV, 'readonly').objectStore(KV).get(DATA_KEY)) as Promise<DataRecord | undefined>;
  }

  private async writeText(text: string): Promise<void> {
    const db = await this.db();
    const tx = db.transaction(KV, 'readwrite');
    tx.objectStore(KV).put({ text, savedAt: new Date().toISOString() } satisfies DataRecord, DATA_KEY);
    await txDone(tx);
  }

  async load(): Promise<LoadResult> {
    requestPersistence();
    const rec = await this.readRecord();
    if (!rec || typeof rec.text !== 'string') return { status: 'empty' };
    const r = parseAppData(rec.text);
    if (!r.ok) return { status: 'corrupt', error: r.error };
    const backups = await this.listBackups();
    const day = today();
    if (!backups.some((b) => b.reason === 'daily' && b.createdAt.slice(0, 10) === day)) await this.backupNow('daily');
    if (r.migratedFrom !== undefined) {
      await this.backupNow('pre-migration');
      // Never auto-write a migration result without records over existing data (review #1).
      if (hasUserContent(r.data)) await this.save(r.data);
      return { status: 'ok', data: r.data, migratedFrom: r.migratedFrom };
    }
    return { status: 'ok', data: r.data };
  }

  save(data: AppData): Promise<void> {
    const text = serializeAppData(data);
    return this.queue.run(() => this.writeText(text));
  }

  flush(): Promise<void> {
    return this.queue.flush();
  }

  async backupNow(reason: BackupReason = 'manual'): Promise<BackupInfo> {
    await this.flush();
    const rec = await this.readRecord();
    const text = rec?.text ?? serializeAppData(emptyPlaceholder());
    const createdAt = new Date().toISOString();
    const backup: BackupRecord = { id: `${createdAt}-${reason}-${newId().slice(0, 8)}`, createdAt, reason, text, sizeBytes: text.length };
    if (!parseAppData(text).ok) backup.damaged = true;
    const db = await this.db();
    const tx = db.transaction(BACKUPS, 'readwrite');
    tx.objectStore(BACKUPS).put(backup);
    await txDone(tx);
    await this.prune();
    const { text: _t, damaged: _d, ...info } = backup;
    return info;
  }

  /** Restorable backups, newest first (damaged copies are left out and never pruned). */
  private async allBackups(): Promise<BackupRecord[]> {
    const db = await this.db();
    const all = ((await req(db.transaction(BACKUPS, 'readonly').objectStore(BACKUPS).getAll())) as BackupRecord[]).filter((b) => !b.damaged);
    return all.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  }

  private async prune(): Promise<void> {
    const all = await this.allBackups();
    const daily = all.filter((b) => b.reason === 'daily').slice(KEEP_DAILY);
    const other = all.filter((b) => b.reason !== 'daily').slice(KEEP_OTHER);
    const remove = [...daily, ...other];
    if (!remove.length) return;
    const db = await this.db();
    const tx = db.transaction(BACKUPS, 'readwrite');
    for (const b of remove) tx.objectStore(BACKUPS).delete(b.id);
    await txDone(tx);
  }

  async listBackups(): Promise<BackupInfo[]> {
    return (await this.allBackups()).map(({ text: _t, damaged: _d, ...info }) => info);
  }

  async restoreBackup(id: string): Promise<RestoreResult> {
    const db = await this.db();
    const rec = (await req(db.transaction(BACKUPS, 'readonly').objectStore(BACKUPS).get(id))) as BackupRecord | undefined;
    if (!rec) return { ok: false, error: 'Backup not found' };
    const r = parseAppData(rec.text);
    return r.ok ? { ok: true, data: r.data } : r;
  }

  async exportBackupFile(data: AppData): Promise<boolean> {
    downloadBlob(new Blob([serializeAppData(data)], { type: 'application/json' }), backupFileName(today()));
    return true;
  }

  async importBackupFile(file?: File): Promise<RestoreResult | null> {
    if (!file) return null;
    const r = parseAppData(await file.text());
    return r.ok ? { ok: true, data: r.data } : r;
  }

  async saveFile(bytes: Uint8Array | ArrayBuffer | Blob, suggestedName: string, mimeType: string): Promise<boolean> {
    downloadBlob(toBlob(bytes, mimeType), suggestedName);
    return true;
  }

  info(): StorageInfo {
    return { kind: 'web' };
  }

  onBeforeClose(cb: () => Promise<void> | void): () => void {
    this.closeCbs.add(cb);
    const handler = () => {
      void Promise.resolve()
        .then(cb)
        .catch(() => undefined);
    };
    window.addEventListener('pagehide', handler);
    window.addEventListener('beforeunload', handler);
    return () => {
      this.closeCbs.delete(cb);
      window.removeEventListener('pagehide', handler);
      window.removeEventListener('beforeunload', handler);
    };
  }
}

function emptyPlaceholder(): AppData {
  // Only used when backing up while nothing is stored yet.
  return {
    version: 1,
    clients: [],
    suppliers: [],
    products: [],
    batches: [],
    sales: [],
    payments: [],
    expenses: [],
    categories: [],
    importRows: [],
    settings: { businessName: '', language: 'nl', firstRunDone: false },
  };
}

let persistRequested = false;
/** Ask the browser not to evict our data (best effort, once). */
export function requestPersistence(): void {
  if (persistRequested) return;
  persistRequested = true;
  try {
    void navigator.storage?.persist?.().catch(() => undefined);
  } catch {
    /* ignore */
  }
}
