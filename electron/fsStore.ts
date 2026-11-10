/**
 * Pure file-system logic for the Electron main process (no `electron` imports, so it is unit-testable):
 * atomic writes, reading the live file, backup naming, listing and rotation.
 *
 * Live file: <userData>/pittig-data.json (+ pittig-data.json.bak = previous version).
 * Backups:   <Documents>/Pittig Finances/Backups/
 *              pittig-backup-YYYY-MM-DD.json                     (daily, keep 30)
 *              pittig-backup-YYYY-MM-DD-HHmmss-<reason>.json     (other reasons, keep 30)
 *              pittig-damaged-YYYY-MM-DD-HHmmss-<reason>.json    (copy of a live file that failed validation;
 *                                                                never listed as a restore candidate, never pruned)
 */
import { promises as fs, constants as fsConstants } from 'node:fs';
import path from 'node:path';
import type { BackupInfo, BackupReason } from '../src/storage/types';

export const DATA_FILE_NAME = 'pittig-data.json';
export const KEEP_DAILY = 30;
export const KEEP_OTHER = 30;

const REASONS: readonly BackupReason[] = ['daily', 'manual', 'pre-migration', 'pre-restore', 'pre-import', 'pre-replace'];
const RETRY_CODES = new Set(['EBUSY', 'EPERM', 'EACCES']);

const DAILY_RE = /^pittig-backup-(\d{4}-\d{2}-\d{2})\.json$/;
const OTHER_RE = /^pittig-backup-(\d{4}-\d{2}-\d{2})-(\d{6})-([a-z-]+?)(?:-(\d+))?\.json$/;

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

/** Local calendar date "YYYY-MM-DD". */
export function localDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function localTime(d: Date): string {
  return `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

export function isBackupReason(v: unknown): v is BackupReason {
  return typeof v === 'string' && (REASONS as readonly string[]).includes(v);
}

/** File name for a backup made at `now` for `reason`. `n` (>1) disambiguates same-second backups. */
export function backupName(reason: BackupReason, now: Date, n = 1): string {
  if (reason === 'daily') return `pittig-backup-${localDate(now)}.json`;
  return `pittig-backup-${localDate(now)}-${localTime(now)}-${reason}${n > 1 ? `-${n}` : ''}.json`;
}

/** File name for a copy of a damaged live file (not a backup name: never listed or offered for restore). */
export function damagedName(reason: BackupReason, now: Date, n = 1): string {
  return `pittig-damaged-${localDate(now)}-${localTime(now)}-${reason}${n > 1 ? `-${n}` : ''}.json`;
}

/** Parse a backup file name; null when it is not one of ours (also rejects anything path-like). */
export function parseBackupName(name: string): { reason: BackupReason; date: string; sortKey: string } | null {
  if (name !== path.basename(name)) return null;
  const d = DAILY_RE.exec(name);
  if (d) return { reason: 'daily', date: d[1], sortKey: `${d[1]}-000000` };
  const o = OTHER_RE.exec(name);
  if (o && isBackupReason(o[3]) && o[3] !== 'daily') {
    return { reason: o[3], date: o[1], sortKey: `${o[1]}-${o[2]}-${pad(Number(o[4] ?? 1), 4)}` };
  }
  return null;
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Retry `fn` on transient Windows locking errors (antivirus, OneDrive, indexer). */
export async function withRetry<T>(fn: () => Promise<T>, retries = 5, delayMs = 100): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (attempt >= retries || !code || !RETRY_CODES.has(code)) throw e;
      await sleep(delayMs * (attempt + 1));
    }
  }
}

export interface AtomicWriteOptions {
  /** Keep a copy of the previous file as `<file>.bak`. Default true. */
  keepBak?: boolean;
  retries?: number;
  retryDelayMs?: number;
  /** Test hook: replaces fs.rename. */
  rename?: (from: string, to: string) => Promise<void>;
}

/** Write `text` to `file` atomically: write a temp file, fsync, (keep .bak), rename over the target. */
export async function atomicWrite(file: string, text: string | Uint8Array, opts: AtomicWriteOptions = {}): Promise<void> {
  const { keepBak = true, retries = 5, retryDelayMs = 100 } = opts;
  const rename = opts.rename ?? ((a: string, b: string) => fs.rename(a, b));
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  const handle = await fs.open(tmp, 'w');
  try {
    await handle.writeFile(text);
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    if (keepBak && (await exists(file))) {
      await withRetry(() => fs.copyFile(file, `${file}.bak`), retries, retryDelayMs);
    }
    await withRetry(() => rename(tmp, file), retries, retryDelayMs);
  } catch (e) {
    await fs.rm(tmp, { force: true }).catch(() => undefined);
    throw e;
  }
}

export async function exists(file: string): Promise<boolean> {
  try {
    await fs.access(file, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/** Read the live file. Missing → {exists:false}; other I/O errors throw. */
export async function readLive(file: string): Promise<{ exists: false } | { exists: true; text: string }> {
  try {
    const text = await withRetry(() => fs.readFile(file, 'utf8'));
    return { exists: true, text };
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return { exists: false };
    throw e;
  }
}

/** Throw unless `text` is valid JSON (main never writes non-JSON over the live file). */
export function assertJson(text: unknown): asserts text is string {
  if (typeof text !== 'string' || text.trim() === '') throw new Error('Refusing to write: empty data');
  JSON.parse(text);
}

async function infoFor(dir: string, name: string): Promise<BackupInfo | null> {
  const parsed = parseBackupName(name);
  if (!parsed) return null;
  const full = path.join(dir, name);
  try {
    const st = await fs.stat(full);
    if (!st.isFile()) return null;
    return { id: name, createdAt: st.mtime.toISOString(), reason: parsed.reason, sizeBytes: st.size, path: full };
  } catch {
    return null;
  }
}

/** All backups in `dir`, newest first (by file-name timestamp). */
export async function listBackups(dir: string): Promise<BackupInfo[]> {
  let names: string[];
  try {
    names = await fs.readdir(dir);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw e;
  }
  const keyed = names
    .map((n) => ({ n, p: parseBackupName(n) }))
    .filter((x): x is { n: string; p: NonNullable<ReturnType<typeof parseBackupName>> } => !!x.p)
    .sort((a, b) => (a.p.sortKey < b.p.sortKey ? 1 : a.p.sortKey > b.p.sortKey ? -1 : 0));
  const infos = await Promise.all(keyed.map((x) => infoFor(dir, x.n)));
  return infos.filter((i): i is BackupInfo => !!i);
}

/** Delete old backups: keep the newest `keepDaily` dailies and newest `keepOther` other backups. */
export async function pruneBackups(dir: string, keepDaily = KEEP_DAILY, keepOther = KEEP_OTHER): Promise<string[]> {
  const all = await listBackups(dir);
  const remove = [
    ...all.filter((b) => b.reason === 'daily').slice(keepDaily),
    ...all.filter((b) => b.reason !== 'daily').slice(keepOther),
  ];
  for (const b of remove) await fs.rm(path.join(dir, b.id), { force: true }).catch(() => undefined);
  return remove.map((b) => b.id);
}

export interface MakeBackupOptions {
  /**
   * Content check (main passes `parseAppData(text).ok`). When it fails the live file is NOT stored as
   * a backup: with `onInvalid: 'skip'` nothing is written (daily backup), otherwise (default
   * 'damaged') it is kept as `pittig-damaged-…json`, which is never offered as a restore candidate.
   */
  validate?: (text: string) => boolean;
  onInvalid?: 'skip' | 'damaged';
}

/**
 * Copy the live file (raw bytes) into `dir` as a backup for `reason`.
 * Returns null when there is no live file yet (nothing to back up) or a 'skip'ped invalid file.
 * A 'daily' backup is made only once per calendar day (an existing one is kept).
 */
export async function makeBackup(liveFile: string, dir: string, reason: BackupReason, now = new Date(), opts: MakeBackupOptions = {}): Promise<BackupInfo | null> {
  if (!(await exists(liveFile))) return null;
  await fs.mkdir(dir, { recursive: true });
  const bytes = await withRetry(() => fs.readFile(liveFile));
  if (opts.validate && !opts.validate(bytes.toString('utf8'))) {
    if (opts.onInvalid === 'skip') return null;
    let name = damagedName(reason, now);
    for (let n = 2; await exists(path.join(dir, name)); n++) name = damagedName(reason, now, n);
    const full = path.join(dir, name);
    await atomicWrite(full, bytes, { keepBak: false });
    return { id: name, createdAt: now.toISOString(), reason, sizeBytes: bytes.length, path: full };
  }
  let name = backupName(reason, now);
  if (reason === 'daily') {
    if (await exists(path.join(dir, name))) return infoFor(dir, name);
  } else {
    for (let n = 2; await exists(path.join(dir, name)); n++) name = backupName(reason, now, n);
  }
  await atomicWrite(path.join(dir, name), bytes, { keepBak: false });
  await pruneBackups(dir);
  return infoFor(dir, name);
}

/** True when today's daily backup exists. */
export async function hasDailyBackup(dir: string, now = new Date()): Promise<boolean> {
  return exists(path.join(dir, backupName('daily', now)));
}

/** Read a backup by id (file name). Rejects ids that are not backup file names. */
export async function readBackup(dir: string, id: string): Promise<string> {
  if (!parseBackupName(id)) throw new Error('Unknown backup');
  return fs.readFile(path.join(dir, id), 'utf8');
}
