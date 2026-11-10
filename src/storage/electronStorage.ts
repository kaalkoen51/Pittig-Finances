/**
 * Windows storage: thin wrapper over `window.pittig` (electron/preload.ts).
 * Owned by the Electron agent (2d) from here on; the contract is src/storage/types.ts + electronApi.ts.
 */
import { hasUserContent } from '../domain/calc';
import { today } from '../domain/dates';
import { parseAppData, serializeAppData } from '../domain/migrate';
import type { AppData } from '../domain/types';
import { backupFileName, toBlob } from './download';
import type { PittigBridge } from './electronApi';
import type { BackupInfo, BackupReason, LoadResult, RestoreResult, Storage, StorageInfo, UpdateCheckResult } from './types';
import { WriteQueue } from './writeQueue';

export class ElectronStorage implements Storage {
  private queue = new WriteQueue();

  constructor(private api: PittigBridge) {}

  async load(): Promise<LoadResult> {
    const file = await this.api.readData();
    if (!file.exists) return { status: 'empty' };
    const r = parseAppData(file.text);
    if (!r.ok) return { status: 'corrupt', error: r.error };
    if (r.migratedFrom !== undefined) {
      await this.api.backupNow('pre-migration');
      // Never auto-write a migration result without records over an existing file (review #1):
      // the store saves it later only after a real edit.
      if (hasUserContent(r.data)) await this.save(r.data);
      return { status: 'ok', data: r.data, migratedFrom: r.migratedFrom };
    }
    return { status: 'ok', data: r.data };
  }

  save(data: AppData): Promise<void> {
    const text = serializeAppData(data);
    return this.queue.run(async () => {
      await this.api.writeData(text);
    });
  }

  flush(): Promise<void> {
    return this.queue.flush();
  }

  async backupNow(reason: BackupReason = 'manual'): Promise<BackupInfo> {
    await this.flush();
    return this.api.backupNow(reason);
  }

  listBackups(): Promise<BackupInfo[]> {
    return this.api.listBackups();
  }

  async restoreBackup(id: string): Promise<RestoreResult> {
    try {
      const r = parseAppData(await this.api.readBackup(id));
      return r.ok ? { ok: true, data: r.data } : r;
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }

  async exportBackupFile(data: AppData): Promise<boolean> {
    const r = await this.api.exportBackupFile(serializeAppData(data), backupFileName(today()));
    return r.saved;
  }

  async importBackupFile(file?: File): Promise<RestoreResult | null> {
    let text: string;
    if (file) text = await file.text();
    else {
      const r = await this.api.importBackupFile();
      if (r.canceled) return null;
      text = r.text;
    }
    const parsed = parseAppData(text);
    return parsed.ok ? { ok: true, data: parsed.data } : parsed;
  }

  async saveFile(bytes: Uint8Array | ArrayBuffer | Blob, suggestedName: string, mimeType: string): Promise<boolean> {
    const buf = new Uint8Array(await toBlob(bytes, mimeType).arrayBuffer());
    const ext = suggestedName.includes('.') ? suggestedName.split('.').pop()! : '*';
    const r = await this.api.saveFile(buf, suggestedName, [{ name: ext.toUpperCase(), extensions: [ext] }]);
    return r.saved;
  }

  openDataFolder(): Promise<void> {
    return this.api.openDataFolder();
  }

  info(): StorageInfo {
    return { kind: 'electron', dataPath: this.api.info.dataPath, backupDir: this.api.info.backupDir };
  }

  appVersion(): string {
    return this.api.info.appVersion;
  }

  async checkForUpdates(): Promise<UpdateCheckResult> {
    try {
      return await this.api.checkForUpdates();
    } catch (e) {
      return { status: 'error', message: (e as Error).message };
    }
  }

  onBeforeClose(cb: () => Promise<void> | void): () => void {
    const off = this.api.onBeforeClose(cb);
    const handler = () => {
      void Promise.resolve()
        .then(cb)
        .catch(() => undefined);
    };
    window.addEventListener('beforeunload', handler);
    return () => {
      off();
      window.removeEventListener('beforeunload', handler);
    };
  }
}
