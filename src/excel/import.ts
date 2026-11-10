/**
 * Turning parsed tables into data:
 * 1. bank / any sheet → ImportRows ("To sort"), with fingerprints and duplicate skipping;
 * 2. our own export format → update or create Clients / Suppliers / Products (matched by ID, then name).
 */
import { newId } from '../domain/ids';
import { dedupeImportRows, importFingerprint, normalizeDescription } from '../domain/importing';
import type { AppData, Cents, Client, ImportRow, Product, Supplier } from '../domain/types';
import { COLS, SHEETS, type ColKey } from './labels';
import { cellText, normalizeHeader, parseAmountCell, type Cell, type ParsedRow, type Table, type WorkbookData } from './parse';

// ---------- bank rows → ImportRows ----------

/** "ING (1).csv" → "ING.csv": browsers add " (1)" to repeated downloads; keep fingerprints stable. */
export function normalizeSource(fileName: string): string {
  return fileName.replace(/\s*\(\d+\)(?=\.[^.]+$|$)/, '').trim();
}

export interface BuildResult {
  /** New rows to add. */
  rows: ImportRow[];
  /** Rows already imported earlier (or repeated). */
  duplicates: number;
  /** Rows without a readable date or amount (skipped). */
  invalid: number;
}

/**
 * Build ImportRows from parsed rows and drop those already present. Identical transactions inside
 * one file (e.g. two equal market fees on one day) are kept apart by an occurrence suffix "#2" on
 * the fingerprint, so re-importing the same file still skips all of them.
 */
export function buildImportRows(parsed: ParsedRow[], source: string, existing: readonly Pick<ImportRow, 'fingerprint'>[], now: Date = new Date()): BuildResult {
  const src = normalizeSource(source);
  const importedAt = now.toISOString();
  const seen = new Map<string, number>();
  const incoming: ImportRow[] = [];
  let invalid = 0;
  for (const p of parsed) {
    if (p.error || p.date === null || p.amount === null) {
      invalid++;
      continue;
    }
    const description = p.description.trim();
    const base = importFingerprint({ date: p.date, amount: p.amount, description, source: src });
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    const row: ImportRow = {
      id: newId(),
      date: p.date,
      description,
      amount: p.amount,
      source: src,
      fingerprint: n === 1 ? base : `${base}#${n}`,
      status: 'todo',
      importedAt,
    };
    if (p.counterparty) row.counterparty = p.counterparty;
    incoming.push(row);
  }
  const { fresh, duplicates } = dedupeImportRows(existing, incoming);
  return { rows: fresh, duplicates, invalid };
}

// ---------- own format round trip ----------

export type EntityKind = 'clients' | 'suppliers' | 'products';
const ENTITY_KINDS: EntityKind[] = ['clients', 'suppliers', 'products'];

const allNames = (k: ColKey) => [COLS[k].nl, COLS[k].en].map(normalizeHeader);

/** Which of our entity sheets this table is (by sheet name + ID and Name columns), or null. */
export function entitySheetKind(t: Table): EntityKind | null {
  const n = normalizeHeader(t.name);
  const kind = ENTITY_KINDS.find((k) => [SHEETS[k].nl, SHEETS[k].en].map(normalizeHeader).includes(n));
  if (!kind) return null;
  const header = (t.rows[0] ?? []).map((c) => normalizeHeader(cellText(c)));
  if (!header.includes('id')) return null;
  if (!allNames('name').some((x) => header.includes(x))) return null;
  return kind;
}

/** Entity sheets found in a workbook (our own export). */
export function findEntitySheets(wb: WorkbookData): { kind: EntityKind; table: Table }[] {
  const out: { kind: EntityKind; table: Table }[] = [];
  for (const t of wb.sheets) {
    const kind = entitySheetKind(t);
    if (kind && t.rows.length > 1) out.push({ kind, table: t });
  }
  return out;
}

export interface EntityChanges {
  clients: Client[];
  suppliers: Supplier[];
  products: Product[];
  created: number;
  updated: number;
  unchanged: number;
}

function colIndex(header: string[], key: ColKey): number {
  const names = allNames(key);
  return header.findIndex((h) => names.includes(h));
}

type Record_ = { id: string; name: string; email?: string; phone?: string; notes?: string; unit?: string; defaultPrice?: Cents };

function readRecords(t: Table, kind: EntityKind): Record_[] {
  const header = (t.rows[0] ?? []).map((c) => normalizeHeader(cellText(c)));
  const ix = {
    id: colIndex(header, 'id'),
    name: colIndex(header, 'name'),
    email: colIndex(header, 'email'),
    phone: colIndex(header, 'phone'),
    notes: colIndex(header, 'notes'),
    unit: colIndex(header, 'unit'),
    price: colIndex(header, 'defaultPrice'),
  };
  const out: Record_[] = [];
  for (const r of t.rows.slice(1)) {
    const get = (i: number): Cell => (i >= 0 ? (r[i] ?? null) : null);
    const name = cellText(get(ix.name));
    if (!name) continue;
    const rec: Record_ = { id: cellText(get(ix.id)), name };
    if (kind !== 'products') {
      const email = cellText(get(ix.email));
      const phone = cellText(get(ix.phone));
      const notes = cellText(get(ix.notes));
      if (email) rec.email = email;
      if (phone) rec.phone = phone;
      if (notes) rec.notes = notes;
    } else {
      const unit = cellText(get(ix.unit));
      if (unit) rec.unit = unit;
      const price = parseAmountCell(get(ix.price));
      if (price !== null) rec.defaultPrice = price;
    }
    out.push(rec);
  }
  return out;
}

function sameJSON(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Compute upserts for Clients/Suppliers/Products from our own export. Matches by ID, then by
 * name (case/accents-insensitive). Existing items are updated with non-empty values from the file;
 * new names are created. Never creates a duplicate (also not within the file).
 */
export function planEntityImport(data: AppData, sheets: { kind: EntityKind; table: Table }[]): EntityChanges {
  const res: EntityChanges = { clients: [], suppliers: [], products: [], created: 0, updated: 0, unchanged: 0 };
  for (const kind of ENTITY_KINDS) {
    const current = new Map<string, Client | Supplier | Product>(); // by id, includes changes so far
    for (const x of data[kind]) current.set(x.id, x);
    const byName = () => {
      const m = new Map<string, string>();
      for (const x of current.values()) if (!m.has(normalizeDescription(x.name))) m.set(normalizeDescription(x.name), x.id);
      return m;
    };
    const changed = new Map<string, Client | Supplier | Product>();
    for (const { kind: k, table } of sheets) {
      if (k !== kind) continue;
      for (const rec of readRecords(table, kind)) {
        const id = (rec.id && current.has(rec.id) ? rec.id : undefined) ?? byName().get(normalizeDescription(rec.name));
        const before = id ? current.get(id) : undefined;
        let next: Client | Supplier | Product;
        if (kind === 'products') {
          const b = before as Product | undefined;
          next = {
            ...(b ?? { id: newId(), archived: false, unit: '', defaultPrice: 0 }),
            name: rec.name,
            ...(rec.unit !== undefined ? { unit: rec.unit } : {}),
            ...(rec.defaultPrice !== undefined ? { defaultPrice: rec.defaultPrice } : {}),
          } as Product;
        } else {
          const b = before as Client | undefined;
          next = {
            ...(b ?? { id: newId(), archived: false }),
            name: rec.name,
            ...(rec.email ? { email: rec.email } : {}),
            ...(rec.phone ? { phone: rec.phone } : {}),
            ...(rec.notes ? { notes: rec.notes } : {}),
          } as Client;
        }
        if (before && sameJSON(before, next)) {
          if (!changed.has(next.id)) res.unchanged++;
          continue;
        }
        if (!before) res.created++;
        else if (!changed.has(next.id) && data[kind].some((x) => x.id === next.id)) res.updated++;
        current.set(next.id, next);
        changed.set(next.id, next);
      }
    }
    (res[kind] as (Client | Supplier | Product)[]) = [...changed.values()];
  }
  return res;
}
