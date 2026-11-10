// @vitest-environment node
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  assertJson,
  atomicWrite,
  backupName,
  hasDailyBackup,
  listBackups,
  makeBackup,
  parseBackupName,
  pruneBackups,
  readBackup,
  readLive,
  withRetry,
} from './fsStore';

let dir: string;
let live: string;
let backups: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pittig-fs-'));
  live = path.join(dir, 'data', 'pittig-data.json');
  backups = path.join(dir, 'Backups');
});
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

const at = (iso: string) => new Date(iso); // local time (no Z)

describe('backup names', () => {
  it('formats daily and named backups', () => {
    expect(backupName('daily', at('2026-03-12T09:05:07'))).toBe('pittig-backup-2026-03-12.json');
    expect(backupName('pre-import', at('2026-03-12T09:05:07'))).toBe('pittig-backup-2026-03-12-090507-pre-import.json');
    expect(backupName('manual', at('2026-03-12T09:05:07'), 2)).toBe('pittig-backup-2026-03-12-090507-manual-2.json');
  });

  it('parses its own names and rejects others', () => {
    expect(parseBackupName('pittig-backup-2026-03-12.json')?.reason).toBe('daily');
    expect(parseBackupName('pittig-backup-2026-03-12-090507-pre-restore.json')?.reason).toBe('pre-restore');
    expect(parseBackupName('pittig-backup-2026-03-12-090507-manual-3.json')?.reason).toBe('manual');
    expect(parseBackupName('pittig-backup-2026-03-12-090507-bogus.json')).toBeNull();
    expect(parseBackupName('../pittig-backup-2026-03-12.json')).toBeNull();
    expect(parseBackupName('notes.json')).toBeNull();
  });
});

describe('atomicWrite / readLive', () => {
  it('reports a missing file as not existing', async () => {
    expect(await readLive(live)).toEqual({ exists: false });
  });

  it('writes, keeps a .bak of the previous version and leaves no temp files', async () => {
    await atomicWrite(live, '{"v":1}');
    await atomicWrite(live, '{"v":2}');
    expect(await readLive(live)).toEqual({ exists: true, text: '{"v":2}' });
    expect(await fs.readFile(`${live}.bak`, 'utf8')).toBe('{"v":1}');
    const files = await fs.readdir(path.dirname(live));
    expect(files.filter((f) => f.endsWith('.tmp'))).toEqual([]);
  });

  it('retries rename on EBUSY/EPERM and succeeds', async () => {
    let calls = 0;
    await atomicWrite(live, '{"ok":true}', {
      retryDelayMs: 1,
      rename: async (a, b) => {
        calls++;
        if (calls < 3) throw Object.assign(new Error('busy'), { code: calls === 1 ? 'EBUSY' : 'EPERM' });
        await fs.rename(a, b);
      },
    });
    expect(calls).toBe(3);
    expect((await readLive(live)) as { text: string }).toMatchObject({ text: '{"ok":true}' });
  });

  it('gives up after 5 retries, keeps the old file and cleans up the temp file', async () => {
    await atomicWrite(live, '{"v":1}');
    let calls = 0;
    await expect(
      atomicWrite(live, '{"v":2}', {
        retryDelayMs: 1,
        rename: async () => {
          calls++;
          throw Object.assign(new Error('locked'), { code: 'EBUSY' });
        },
      }),
    ).rejects.toThrow('locked');
    expect(calls).toBe(6);
    expect(await fs.readFile(live, 'utf8')).toBe('{"v":1}');
    expect((await fs.readdir(path.dirname(live))).filter((f) => f.endsWith('.tmp'))).toEqual([]);
  });

  it('does not retry other errors', async () => {
    let calls = 0;
    await expect(
      withRetry(async () => {
        calls++;
        throw Object.assign(new Error('nope'), { code: 'ENOSPC' });
      }),
    ).rejects.toThrow('nope');
    expect(calls).toBe(1);
  });

  it('assertJson rejects non-JSON and empty text', () => {
    expect(() => assertJson('{"a":1}')).not.toThrow();
    expect(() => assertJson('')).toThrow();
    expect(() => assertJson('{oops')).toThrow();
    expect(() => assertJson(42)).toThrow();
  });
});

describe('backups', () => {
  it('returns null when there is nothing to back up', async () => {
    expect(await makeBackup(live, backups, 'manual')).toBeNull();
    expect(await listBackups(backups)).toEqual([]);
  });

  it('copies the raw live file, even when corrupt', async () => {
    await atomicWrite(live, '{corrupt');
    const info = await makeBackup(live, backups, 'pre-restore', at('2026-03-12T10:00:00'));
    expect(info?.id).toBe('pittig-backup-2026-03-12-100000-pre-restore.json');
    expect(info?.reason).toBe('pre-restore');
    expect(await readBackup(backups, info!.id)).toBe('{corrupt');
  });

  it('can skip backing up a damaged file (automatic daily backup)', async () => {
    await atomicWrite(live, '{"version":1, "clients": [tru');
    expect(await makeBackup(live, backups, 'daily', new Date(), { onlyValidJson: true })).toBeNull();
    expect(await listBackups(backups)).toEqual([]);
  });

  it('makes one daily backup per day and keeps the first one', async () => {
    await atomicWrite(live, '{"v":1}');
    const now = at('2026-03-12T08:00:00');
    await makeBackup(live, backups, 'daily', now);
    await atomicWrite(live, '{"v":2}');
    await makeBackup(live, backups, 'daily', at('2026-03-12T18:00:00'));
    expect(await hasDailyBackup(backups, now)).toBe(true);
    const list = await listBackups(backups);
    expect(list).toHaveLength(1);
    expect(await readBackup(backups, list[0].id)).toBe('{"v":1}');
  });

  it('never overwrites a same-second named backup', async () => {
    await atomicWrite(live, '{}');
    const now = at('2026-03-12T08:00:00');
    const a = await makeBackup(live, backups, 'manual', now);
    const b = await makeBackup(live, backups, 'manual', now);
    expect(a?.id).not.toBe(b?.id);
    expect(await listBackups(backups)).toHaveLength(2);
  });

  it('lists newest first and ignores foreign files', async () => {
    await fs.mkdir(backups, { recursive: true });
    for (const n of [
      'pittig-backup-2026-01-01.json',
      'pittig-backup-2026-03-01-120000-pre-import.json',
      'pittig-backup-2026-02-01.json',
      'my-own-file.json',
    ]) {
      await fs.writeFile(path.join(backups, n), '{}');
    }
    const ids = (await listBackups(backups)).map((b) => b.id);
    expect(ids).toEqual(['pittig-backup-2026-03-01-120000-pre-import.json', 'pittig-backup-2026-02-01.json', 'pittig-backup-2026-01-01.json']);
  });

  it('keeps the last 30 dailies and the last 30 named backups', async () => {
    await fs.mkdir(backups, { recursive: true });
    for (let i = 0; i < 35; i++) {
      const d = new Date(2026, 0, 1 + i);
      await fs.writeFile(path.join(backups, backupName('daily', d)), '{}');
      await fs.writeFile(path.join(backups, backupName('pre-import', d)), '{}');
    }
    await fs.writeFile(path.join(backups, 'keep-me.txt'), 'x');
    const removed = await pruneBackups(backups);
    expect(removed).toHaveLength(10);
    const left = await listBackups(backups);
    expect(left.filter((b) => b.reason === 'daily')).toHaveLength(30);
    expect(left.filter((b) => b.reason === 'pre-import')).toHaveLength(30);
    // the oldest ones went
    expect(left.some((b) => b.id === 'pittig-backup-2026-01-01.json')).toBe(false);
    expect(left.some((b) => b.id === backupName('daily', new Date(2026, 1, 4)))).toBe(true);
    expect(await fs.readFile(path.join(backups, 'keep-me.txt'), 'utf8')).toBe('x');
  });

  it('refuses to read paths outside the backup folder', async () => {
    await expect(readBackup(backups, '../data/pittig-data.json')).rejects.toThrow('Unknown backup');
  });
});
