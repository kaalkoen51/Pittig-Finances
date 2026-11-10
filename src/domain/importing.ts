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

/** `date|amountCents|normalized description|source` (plan revision). */
export function importFingerprint(row: { date: ISODate; amount: Cents; description: string; source: string }): string {
  return `${row.date}|${row.amount}|${normalizeDescription(row.description)}|${row.source}`;
}

/** Split new rows into those to add and the number of duplicates (already present or repeated in the batch). */
export function dedupeImportRows<T extends Pick<ImportRow, 'fingerprint'>>(existing: readonly Pick<ImportRow, 'fingerprint'>[], incoming: readonly T[]): { fresh: T[]; duplicates: number } {
  const seen = new Set(existing.map((r) => r.fingerprint));
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
