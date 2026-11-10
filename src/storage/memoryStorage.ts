/**
 * In-memory Storage for unit/component tests. `text` is the stored JSON (null = nothing stored).
 * Records calls in `saves` so tests can assert what was written.
 */
import { parseAppData, serializeAppData } from '../domain/migrate';
import type { AppData } from '../domain/types';
import type { BackupInfo, BackupReason, LoadResult, RestoreResult, Storage, StorageInfo } from './types';

export class MemoryStorage implements Storage {
  text: string | null;
  saves: AppData[] = [];
  backups: (BackupInfo & { text: string })[] = [];
  private closeCbs = new Set<() => Promise<void> | void>();

  constructor(initial?: AppData | string | null) {
    this.text = initial == null ? null : typeof initial === 'string' ? initial : serializeAppData(initial);
  }

  async load(): Promise<LoadResult> {
    if (this.text === null) return { status: 'empty' };
    const r = parseAppData(this.text);
    if (!r.ok) return { status: 'corrupt', error: r.error };
    return r.migratedFrom !== undefined ? { status: 'ok', data: r.data, migratedFrom: r.migratedFrom } : { status: 'ok', data: r.data };
  }
  async save(data: AppData): Promise<void> {
    this.saves.push(data);
    this.text = serializeAppData(data);
  }
  async flush(): Promise<void> {}
  async backupNow(reason: BackupReason = 'manual'): Promise<BackupInfo> {
    const info: BackupInfo = { id: `b${this.backups.length + 1}`, createdAt: new Date().toISOString(), reason };
    this.backups.unshift({ ...info, text: this.text ?? '' });
    return info;
  }
  async listBackups(): Promise<BackupInfo[]> {
    return this.backups.map(({ text: _t, ...b }) => b);
  }
  async restoreBackup(id: string): Promise<RestoreResult> {
    const b = this.backups.find((x) => x.id === id);
    if (!b) return { ok: false, error: 'Backup not found' };
    const r = parseAppData(b.text);
    return r.ok ? { ok: true, data: r.data } : r;
  }
  async exportBackupFile(): Promise<boolean> {
    return true;
  }
  async importBackupFile(file?: File): Promise<RestoreResult | null> {
    if (!file) return null;
    const r = parseAppData(await file.text());
    return r.ok ? { ok: true, data: r.data } : r;
  }
  async saveFile(): Promise<boolean> {
    return true;
  }
  info(): StorageInfo {
    return { kind: 'web' };
  }
  onBeforeClose(cb: () => Promise<void> | void): () => void {
    this.closeCbs.add(cb);
    return () => this.closeCbs.delete(cb);
  }
  /** Test helper: simulate window close. */
  async close(): Promise<void> {
    for (const cb of this.closeCbs) await cb();
  }
}
