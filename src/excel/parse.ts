/**
 * Reading spreadsheets (.xlsx via exceljs, .csv via ./csv) into plain tables, cell value parsing
 * (Dutch/English numbers, bank date formats, Excel serial dates) and bank-column auto-guessing.
 */
import { parseDate } from '../domain/dates';
import { parseMoney } from '../domain/money';
import type { Cents, ISODate } from '../domain/types';
import { parseCsv } from './csv';

/** A cell as we keep it: text, number, date, boolean or empty. */
export type Cell = string | number | boolean | Date | null;

export interface Table {
  name: string;
  rows: Cell[][];
}

export interface WorkbookData {
  fileName: string;
  kind: 'xlsx' | 'csv';
  sheets: Table[];
}

export class ImportFileError extends Error {
  constructor(public code: 'unsupported' | 'unreadable' | 'empty', message?: string) {
    super(message ?? code);
  }
}

// ---------- reading files ----------

export function fileKind(name: string): 'xlsx' | 'csv' | null {
  const ext = name.toLowerCase().split('.').pop() ?? '';
  if (ext === 'xlsx' || ext === 'xlsm') return 'xlsx';
  if (ext === 'csv' || ext === 'txt' || ext === 'tab') return 'csv';
  return null;
}

/** Decode bytes as UTF-8, falling back to Windows-1252 (older Dutch bank exports) when invalid. */
export function decodeText(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

/** Read an .xlsx or .csv file into tables. Throws ImportFileError. */
export async function readWorkbook(bytes: ArrayBuffer | Uint8Array, fileName: string): Promise<WorkbookData> {
  const kind = fileKind(fileName);
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (kind === 'csv') {
    const rows = parseCsv(decodeText(u8));
    if (!rows.length) throw new ImportFileError('empty');
    return { fileName, kind, sheets: [{ name: baseName(fileName), rows }] };
  }
  if (kind === 'xlsx') {
    const ExcelJS = await loadExcelJS();
    const wb = new ExcelJS.Workbook();
    try {
      // exceljs accepts ArrayBuffer/Buffer; give it a standalone copy of the bytes.
      await wb.xlsx.load(u8.slice().buffer as ArrayBuffer);
    } catch (e) {
      throw new ImportFileError('unreadable', e instanceof Error ? e.message : String(e));
    }
    const sheets: Table[] = [];
    wb.eachSheet((ws) => {
      const rows: Cell[][] = [];
      ws.eachRow({ includeEmpty: true }, (row, rowNumber) => {
        const cells: Cell[] = [];
        const values = row.values as unknown[]; // 1-based
        for (let c = 1; c < values.length; c++) cells.push(normalizeExcelValue(values[c]));
        rows[rowNumber - 1] = cells;
      });
      const dense = Array.from(rows, (r) => r ?? []).filter((r) => r.some((c) => c !== null && c !== ''));
      sheets.push({ name: ws.name, rows: dense });
    });
    if (!sheets.some((s) => s.rows.length)) throw new ImportFileError('empty');
    return { fileName, kind, sheets: sheets.filter((s) => s.rows.length) };
  }
  throw new ImportFileError('unsupported');
}

export async function loadExcelJS() {
  const mod = await import('exceljs');
  return (mod as unknown as { default?: typeof mod }).default ?? mod;
}

function baseName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '');
}

/** exceljs cell value → Cell (rich text, formulas, hyperlinks, errors flattened). */
export function normalizeExcelValue(v: unknown): Cell {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number' || typeof v === 'boolean') return v;
  if (v instanceof Date) return v;
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (Array.isArray(o.richText)) return (o.richText as { text: string }[]).map((r) => r.text).join('').trim();
    if ('result' in o) return normalizeExcelValue(o.result);
    if ('formula' in o || 'sharedFormula' in o) return null;
    if (typeof o.text === 'string') return o.text.trim();
    if ('error' in o) return null;
  }
  return String(v);
}

// ---------- cell parsing ----------

const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30);

/** Excel serial day number (e.g. 46000) → ISO date. Only plausible ranges (1955–2150). */
export function excelSerialToISO(n: number): ISODate | null {
  if (!Number.isFinite(n) || n < 20000 || n > 91000) return null;
  const d = new Date(EXCEL_EPOCH_UTC + Math.floor(n) * 86_400_000);
  return utcISO(d);
}

function utcISO(d: Date): ISODate {
  return `${String(d.getUTCFullYear()).padStart(4, '0')}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/**
 * Cell → ISO date. Date cells from exceljs are UTC-midnight based, so they are read in UTC (rounded
 * to the nearest day to absorb time-zone shifts). Numbers are Excel serials or yyyymmdd.
 */
export function parseDateCell(c: Cell): ISODate | null {
  if (c === null || c === undefined || typeof c === 'boolean') return null;
  if (c instanceof Date) {
    const t = c.getTime();
    if (Number.isNaN(t)) return null;
    return utcISO(new Date(Math.round(t / 86_400_000) * 86_400_000));
  }
  if (typeof c === 'number') {
    if (Number.isInteger(c) && c >= 19000101 && c <= 21001231) return parseDate(String(c));
    return excelSerialToISO(c);
  }
  return parseDate(c);
}

/** Cell → cents. Accepts numbers (euros) and text like "1.234,56", "-12,50", "€ 12,50", "1,234.56". */
export function parseAmountCell(c: Cell): Cents | null {
  if (c === null || c === undefined || typeof c === 'boolean' || c instanceof Date) return null;
  return parseMoney(c);
}

/** Text for display/description. */
export function cellText(c: Cell): string {
  if (c === null || c === undefined) return '';
  if (c instanceof Date) return parseDateCell(c) ?? '';
  return String(c).trim();
}

/**
 * Debit/credit indicator → sign. ING "Af"/"Bij", English "Debit"/"Credit", "D"/"C", "-"/"+".
 * Returns -1, 1 or null when unknown.
 */
export function directionSign(c: Cell): 1 | -1 | null {
  const s = cellText(c).toLowerCase();
  if (!s) return null;
  if (['af', 'debit', 'debet', 'd', 'dr', '-', 'uit', 'out', 'withdrawal'].includes(s)) return -1;
  if (['bij', 'credit', 'c', 'cr', '+', 'in', 'deposit'].includes(s)) return 1;
  return null;
}

// ---------- header detection + column guessing ----------

export type MapField = 'date' | 'amount' | 'direction' | 'counterparty' | 'description';
export const MAP_FIELDS: readonly MapField[] = ['date', 'amount', 'direction', 'counterparty', 'description'];

/** Column index per field; -1 = not used. */
export type ColumnMapping = Record<MapField, number>;

export const EMPTY_MAPPING: ColumnMapping = { date: -1, amount: -1, direction: -1, counterparty: -1, description: -1 };

export function normalizeHeader(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

type Rule = { exact?: string[]; contains?: string[]; exclude?: string[] };

/** Known bank headers (ING, Rabobank, ABN AMRO, bunq, Knab, Triodos, ASN, SNS, English exports). */
const RULES: Record<MapField, Rule> = {
  date: {
    exact: ['datum', 'date', 'transactiedatum', 'boekdatum', 'boekingsdatum', 'transaction date', 'booking date', 'transactie datum', 'datum transactie', 'started date', 'completed date'],
    contains: ['datum', 'date'],
    exclude: ['rente', 'interest', 'valuta', 'value', 'geboorte'],
  },
  amount: {
    exact: ['bedrag', 'bedrag eur', 'amount', 'amount eur', 'transactiebedrag', 'bedrag in eur', 'mutatiebedrag', 'betrag', 'value', 'waarde'],
    contains: ['bedrag', 'amount'],
    exclude: ['saldo', 'balance', 'valuta', 'currency', 'munt', 'fee', 'kosten'],
  },
  direction: {
    exact: ['af bij', 'bij af', 'af of bij', 'debit credit', 'credit debit', 'd c', 'c d', 'debet credit', 'credit debet', 'richting', 'direction', 'type'],
    contains: ['af bij', 'debit credit', 'debet credit'],
  },
  counterparty: {
    exact: ['naam tegenpartij', 'naam omschrijving', 'tegenpartij', 'counterparty', 'counterparty name', 'naam', 'name', 'payee', 'begunstigde', 'naam begunstigde', 'tegenrekening naam', 'naam tegenrekening', 'relatie', 'opdrachtgever'],
    contains: ['tegenpartij', 'counterparty', 'begunstigde', 'payee'],
    exclude: ['iban', 'rekening', 'account', 'bic', 'uiteindelijke', 'initierende', 'initiating', 'ultimate'],
  },
  description: {
    exact: ['omschrijving', 'omschrijving 1', 'mededelingen', 'mededeling', 'description', 'memo', 'details', 'omschrijving1', 'reference', 'referentie', 'betalingskenmerk', 'notes', 'toelichting', 'tegenrekening'],
    contains: ['omschrijving', 'mededeling', 'description', 'memo'],
    exclude: ['naam'],
  },
};

function scoreHeader(field: MapField, h: string): number {
  if (!h) return 0;
  const r = RULES[field];
  if (r.exclude?.some((x) => h.includes(x))) return 0;
  const exactIdx = r.exact?.indexOf(h) ?? -1;
  if (exactIdx >= 0) return 100 - exactIdx;
  if (r.contains?.some((x) => h.includes(x))) return 10;
  return 0;
}

/** Score how much a row looks like a header row (number of cells matching a known header). */
function headerScore(row: Cell[]): number {
  let n = 0;
  for (const c of row) {
    if (typeof c !== 'string') continue;
    const h = normalizeHeader(c);
    if (MAP_FIELDS.some((f) => scoreHeader(f, h) > 0)) n++;
  }
  return n;
}

/** Index of the header row within the first 15 rows (best match), or 0. */
export function detectHeaderRow(rows: Cell[][]): number {
  let best = 0;
  let bestScore = 0;
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const s = headerScore(rows[i] ?? []);
    if (s > bestScore) {
      bestScore = s;
      best = i;
    }
  }
  return best;
}

/** Guess a mapping from header names; each column is used at most once. */
export function guessMapping(headers: Cell[], sampleRows: Cell[][] = []): ColumnMapping {
  const mapping: ColumnMapping = { ...EMPTY_MAPPING };
  const norm = headers.map((h) => normalizeHeader(cellText(h)));
  const used = new Set<number>();
  // Most specific fields first so e.g. "Naam / Omschrijving" goes to counterparty, not description.
  const order: MapField[] = ['date', 'amount', 'direction', 'counterparty', 'description'];
  for (const field of order) {
    let best = -1;
    let bestScore = 0;
    norm.forEach((h, i) => {
      if (used.has(i)) return;
      const s = scoreHeader(field, h);
      if (s > bestScore) {
        bestScore = s;
        best = i;
      }
    });
    if (best >= 0) {
      mapping[field] = best;
      used.add(best);
    }
  }
  // "Type" only counts as direction if its values look like Af/Bij, Debit/Credit.
  if (mapping.direction >= 0 && sampleRows.length) {
    const vals = sampleRows.map((r) => r[mapping.direction] ?? null).filter((c) => cellText(c) !== '');
    if (vals.length && vals.filter((c) => directionSign(c) !== null).length < vals.length / 2) mapping.direction = -1;
  }
  // Fallbacks by content when headers did not help.
  if (mapping.date < 0 || mapping.amount < 0) {
    const width = Math.max(0, ...sampleRows.map((r) => r.length));
    for (let i = 0; i < width; i++) {
      if (Object.values(mapping).includes(i)) continue;
      const vals = sampleRows.map((r) => r[i] ?? null).filter((c) => cellText(c) !== '');
      if (!vals.length) continue;
      if (mapping.date < 0 && vals.every((c) => parseDateCell(c) !== null)) mapping.date = i;
      else if (mapping.amount < 0 && vals.every((c) => parseAmountCell(c) !== null)) mapping.amount = i;
    }
  }
  if (mapping.description < 0) {
    const width = Math.max(headers.length, ...sampleRows.map((r) => r.length));
    for (let i = 0; i < width; i++) {
      if (Object.values(mapping).includes(i)) continue;
      const vals = sampleRows.map((r) => r[i] ?? null).filter((c) => cellText(c) !== '');
      if (vals.length && vals.some((c) => typeof c === 'string' && parseAmountCell(c) === null && parseDateCell(c) === null)) {
        mapping.description = i;
        break;
      }
    }
  }
  return mapping;
}

// ---------- rows ----------

export interface ParsedRow {
  /** 1-based row number in the sheet (for messages). */
  line: number;
  date: ISODate | null;
  amount: Cents | null;
  description: string;
  counterparty?: string;
  /** Set when date or amount could not be read. */
  error?: 'date' | 'amount';
}

/** Turn data rows (after the header row) into parsed rows using a mapping. */
export function parseRows(rows: Cell[][], headerRow: number, mapping: ColumnMapping): ParsedRow[] {
  const out: ParsedRow[] = [];
  for (let i = headerRow + 1; i < rows.length; i++) {
    const r = rows[i] ?? [];
    if (!r.some((c) => cellText(c) !== '')) continue;
    const get = (f: MapField): Cell => (mapping[f] >= 0 ? (r[mapping[f]] ?? null) : null);
    const date = parseDateCell(get('date'));
    let amount = parseAmountCell(get('amount'));
    const sign = mapping.direction >= 0 ? directionSign(get('direction')) : null;
    if (amount !== null && sign !== null) amount = Math.abs(amount) * sign;
    const counterparty = cellText(get('counterparty'));
    const description = cellText(get('description')) || counterparty;
    const row: ParsedRow = { line: i + 1, date, amount, description };
    if (counterparty) row.counterparty = counterparty;
    if (date === null) row.error = 'date';
    else if (amount === null) row.error = 'amount';
    out.push(row);
  }
  return out;
}
