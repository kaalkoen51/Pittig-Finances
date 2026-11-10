import { describe, expect, it } from 'vitest';
import { demoData } from '../domain/fixtures';
import { emptyData } from '../domain/migrate';
import { IdbStorage } from './idbStorage';

let n = 0;
const fresh = () => new IdbStorage(`test-db-${++n}`);

describe('IdbStorage', () => {
  it('starts empty, saves and loads', async () => {
    const s = fresh();
    expect(await s.load()).toEqual({ status: 'empty' });
    const d = demoData('2026-03-31');
    await s.save(d);
    await s.flush();
    expect(await s.load()).toEqual({ status: 'ok', data: d });
  });

  it('makes one daily backup per day and can restore it', async () => {
    const s = fresh();
    const d = demoData('2026-03-31');
    await s.save(d);
    await s.load();
    await s.load();
    const list = await s.listBackups();
    expect(list.filter((b) => b.reason === 'daily')).toHaveLength(1);
    const r = await s.restoreBackup(list[0]!.id);
    expect(r).toEqual({ ok: true, data: d });
  });

  it('reports corrupt data without overwriting it', async () => {
    const s = fresh();
    await s.save(emptyData());
    // Corrupt the record directly.
    const db = await new Promise<IDBDatabase>((res) => {
      const o = indexedDB.open(`test-db-${n}`);
      o.onsuccess = () => res(o.result);
    });
    await new Promise<void>((res) => {
      const tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').put({ text: '{"version":1,"clients":', savedAt: '' }, 'data');
      tx.oncomplete = () => res();
    });
    const r = await s.load();
    expect(r.status).toBe('corrupt');
    // A backup copies the raw corrupt text so nothing is lost.
    const b = await s.backupNow('pre-restore');
    expect((await s.restoreBackup(b.id)).ok).toBe(false);
    // review #4: the damaged copy is kept but never offered as a restore candidate.
    expect((await s.listBackups()).some((x) => x.id === b.id)).toBe(false);
  });

  it('does not auto-save a migration result without records over stored data (review #1)', async () => {
    const s = fresh();
    const v0 = { clients: [], suppliers: [], products: [], batches: [], sales: [], payments: [], expenses: [], categories: [], settings: { businessName: 'X' } };
    const text = JSON.stringify(v0);
    const db = await new Promise<IDBDatabase>((res) => {
      const o = indexedDB.open(`test-db-${n}`, 1);
      o.onupgradeneeded = () => {
        o.result.createObjectStore('kv');
        o.result.createObjectStore('backups', { keyPath: 'id' });
      };
      o.onsuccess = () => res(o.result);
    });
    await new Promise<void>((res) => {
      const tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').put({ text, savedAt: '' }, 'data');
      tx.oncomplete = () => res();
    });
    db.close();
    const r = await s.load();
    expect(r.status === 'ok' && r.migratedFrom).toBe(0);
    const db2 = await new Promise<IDBDatabase>((res) => {
      const o = indexedDB.open(`test-db-${n}`);
      o.onsuccess = () => res(o.result);
    });
    const rec = await new Promise<{ text: string }>((res) => {
      const g = db2.transaction('kv').objectStore('kv').get('data');
      g.onsuccess = () => res(g.result as { text: string });
    });
    expect(rec.text).toBe(text);
  });

  it('imports and migrates an old backup file', async () => {
    const s = fresh();
    const v0 = { clients: [], suppliers: [], products: [], batches: [], sales: [], payments: [], expenses: [], categories: [], settings: { businessName: 'X', currency: 'EUR', language: 'nl' } };
    const blob = new Blob([JSON.stringify(v0)]);
    const imported = await s.importBackupFile(new File([blob], 'old.json'));
    expect(imported && imported.ok && imported.data.version).toBe(1);
  });
});
