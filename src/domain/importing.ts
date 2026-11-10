import type { Cents, ISODate, ImportRow } from './types';

/** Lower-case, trim, collapse whitespace, strip accents – for fingerprints and fuzzy matching. */
export function normalizeDescription(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * `date|amountCents|normalized description`. The source file name is deliberately NOT part of it:
 * overlapping bank downloads (Jan–Mar, then Mar–Apr) must not import March twice.
 * `source` is accepted for backwards compatibility and ignored.
 */
export function importFingerprint(row: { date: ISODate; amount: Cents; description: string; source?: string }): string {
  return `${row.date}|${row.amount}|${normalizeDescription(row.description)}`;
}

type Keyable = Pick<ImportRow, 'fingerprint'> & Partial<Pick<ImportRow, 'date' | 'amount' | 'description'>>;

/**
 * Comparison key of a stored row: its fingerprint without the source file name that older versions
 * appended (`date|amount|desc|source[#n]` → `date|amount|desc[#n]`). Rows without date/amount/
 * description fall back to the stored fingerprint.
 */
export function dedupeKey(row: Keyable): string {
  if (row.date === undefined || row.amount === undefined || row.description === undefined) return row.fingerprint;
  const base = importFingerprint({ date: row.date, amount: row.amount, description: row.description });
  if (!row.fingerprint.startsWith(base)) return row.fingerprint;
  const m = /^(?:\|.*)?#(\d+)$/.exec(row.fingerprint.slice(base.length));
  const n = m ? Number(m[1]) : 1;
  return n > 1 ? `${base}#${n}` : base;
}

/** Split new rows into those to add and the number of duplicates (already present or repeated in the batch). */
export function dedupeImportRows<T extends Pick<ImportRow, 'fingerprint'>>(existing: readonly Keyable[], incoming: readonly T[]): { fresh: T[]; duplicates: number } {
  const seen = new Set(existing.map(dedupeKey));
  const fresh: T[] = [];
  let duplicates = 0;
  for (const r of incoming) {
    if (seen.has(r.fingerprint)) duplicates++;
    else {
      seen.add(r.fingerprint);
      fresh.push(r);
    }
  }
  return { fresh, duplicates };
}
