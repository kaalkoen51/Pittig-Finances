/**
 * Excel export (exceljs). Real number + date cells, € format, bold frozen header, sheet names in
 * the current language. `exportAll` / `exportClientStatement` save through Storage.saveFile.
 */
import type * as ExcelJSTypes from 'exceljs';
import {
  allocatePayments,
  batchStats,
  clientSummaries,
  lineTotal,
  monthlySummaries,
  saleTotal,
  supplierOwed,
} from '../domain/calc';
import { formatDate, today as todayFn } from '../domain/dates';
import type { AppData, Cents, Id, ISODate, Language } from '../domain/types';
import type { Storage } from '../storage/types';
import { COLS, SHEETS, WORDS, type ColKey } from './labels';
import { loadExcelJS } from './parse';

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

type Kind = 'text' | 'money' | 'date' | 'int' | 'month';
interface ColSpec {
  key: ColKey;
  kind: Kind;
  width?: number;
}
type Value = string | number | null | undefined;

const MONEY_FMT = '"€ "#,##0.00;[Red]"€ "-#,##0.00';
const DATE_FMT: Record<Language, string> = { nl: 'dd-mm-yyyy', en: 'dd/mm/yyyy' };

/** ISO date → Date at UTC midnight (how Excel/exceljs store calendar dates). */
export function isoToExcelDate(d: ISODate): Date {
  const [y, m, day] = d.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, day));
}

const euros = (c: Cents) => c / 100;

function defaultWidth(kind: Kind): number {
  return kind === 'money' ? 14 : kind === 'date' ? 12 : kind === 'int' ? 10 : kind === 'month' ? 16 : 24;
}

function addTable(wb: ExcelJSTypes.Workbook, name: string, lang: Language, cols: ColSpec[], rows: Value[][], opts: { totalRow?: Value[]; filter?: boolean } = {}): ExcelJSTypes.Worksheet {
  const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = cols.map((c) => ({ header: COLS[c.key][lang], key: c.key, width: c.width ?? defaultWidth(c.kind) }));
  const header = ws.getRow(1);
  header.font = { bold: true };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F7' } };
  header.border = { bottom: { style: 'thin', color: { argb: 'FFC6C6C8' } } };
  const all = opts.totalRow ? [...rows, opts.totalRow] : rows;
  for (const r of all) {
    ws.addRow(
      r.map((v, i) => {
        const kind = cols[i]?.kind;
        if (v === null || v === undefined || v === '') return null;
        if (kind === 'month' && typeof v === 'string' && /^\d{4}-\d{2}$/.test(v)) return isoToExcelDate(`${v}-01`);
        if (kind === 'date' && typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return isoToExcelDate(v);
        return v;
      }),
    );
  }
  cols.forEach((c, i) => {
    const col = ws.getColumn(i + 1);
    if (c.kind === 'money') col.numFmt = MONEY_FMT;
    else if (c.kind === 'date') col.numFmt = DATE_FMT[lang];
    else if (c.kind === 'month') col.numFmt = 'mmmm yyyy';
    else if (c.kind === 'int') col.numFmt = '0';
    if (c.kind === 'money' || c.kind === 'int') col.alignment = { horizontal: 'right' };
  });
  if (opts.totalRow) ws.getRow(ws.rowCount).font = { bold: true };
  if (rows.length && opts.filter !== false) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
  return ws;
}

/** Build the full workbook. Pure apart from exceljs; used by exportAll and tests. */
export async function buildWorkbook(data: AppData, lang: Language = data.settings.language, today: ISODate = todayFn()): Promise<ExcelJSTypes.Workbook> {
  const ExcelJS = await loadExcelJS();
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Pittig Finances';
  wb.created = new Date();
  const w = (k: keyof typeof WORDS) => WORDS[k][lang];

  const clientName = new Map(data.clients.map((c) => [c.id, c.name]));
  const supplierName = new Map(data.suppliers.map((s) => [s.id, s.name]));
  const productName = new Map(data.products.map((p) => [p.id, p.name]));
  const batchCode = new Map(data.batches.map((b) => [b.id, b.code]));
  const categoryName = new Map(data.categories.map((c) => [c.id, c.name]));
  const alloc = allocatePayments(data, today);
  const byDate = <T extends { date: ISODate }>(xs: T[]) => [...xs].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  // Summary per month (chronological) + total row.
  const months = monthlySummaries(data).reverse();
  const tot = { moneyIn: 0, moneyOut: 0, result: 0, sold: 0, costs: 0, profit: 0 };
  const monthRows: Value[][] = months.map(({ month, summary: s }) => {
    for (const k of Object.keys(tot) as (keyof typeof tot)[]) tot[k] += s[k];
    return [month, euros(s.moneyIn), euros(s.moneyOut), euros(s.result), euros(s.sold), euros(s.costs), euros(s.profit)];
  });
  addTable(
    wb,
    SHEETS.summary[lang],
    lang,
    [
      { key: 'month', kind: 'month' },
      { key: 'moneyIn', kind: 'money' },
      { key: 'moneyOut', kind: 'money' },
      { key: 'result', kind: 'money' },
      { key: 'sold', kind: 'money' },
      { key: 'costs', kind: 'money' },
      { key: 'profit', kind: 'money' },
    ],
    monthRows,
    months.length ? { totalRow: [COLS.total[lang], euros(tot.moneyIn), euros(tot.moneyOut), euros(tot.result), euros(tot.sold), euros(tot.costs), euros(tot.profit)] } : {},
  );

  // Sales: one row per line item.
  const saleRows: Value[][] = [];
  for (const s of byDate(data.sales)) {
    const info = alloc.get(s.id);
    const status = !s.clientId ? w('paid') : info?.status === 'paid' ? w('paid') : info?.status === 'partial' ? w('partial') : w('open');
    for (const it of s.items) {
      saleRows.push([
        s.id,
        s.date,
        s.clientId ? (clientName.get(s.clientId) ?? '') : w('walkIn'),
        productName.get(it.productId) ?? '',
        it.batchId ? (batchCode.get(it.batchId) ?? '') : '',
        it.quantity,
        euros(it.unitPrice),
        euros(lineTotal(it)),
        status,
        s.dueDate,
        s.notes,
      ]);
    }
  }
  addTable(
    wb,
    SHEETS.sales[lang],
    lang,
    [
      { key: 'id', kind: 'text', width: 12 },
      { key: 'date', kind: 'date' },
      { key: 'client', kind: 'text', width: 28 },
      { key: 'product', kind: 'text' },
      { key: 'batch', kind: 'text', width: 10 },
      { key: 'quantity', kind: 'int' },
      { key: 'unitPrice', kind: 'money' },
      { key: 'lineTotal', kind: 'money' },
      { key: 'status', kind: 'text', width: 14 },
      { key: 'dueDate', kind: 'date', width: 14 },
      { key: 'notes', kind: 'text', width: 30 },
    ],
    saleRows,
  );

  const methodWord = (m?: string) => (m === 'bank' || m === 'cash' || m === 'card' || m === 'other' ? w(m) : '');
  addTable(
    wb,
    SHEETS.payments[lang],
    lang,
    [
      { key: 'id', kind: 'text', width: 12 },
      { key: 'date', kind: 'date' },
      { key: 'client', kind: 'text', width: 28 },
      { key: 'amount', kind: 'money' },
      { key: 'method', kind: 'text', width: 12 },
      { key: 'saleId', kind: 'text', width: 12 },
      { key: 'notes', kind: 'text', width: 30 },
    ],
    byDate(data.payments).map((p) => [p.id, p.date, clientName.get(p.clientId) ?? '', euros(p.amount), methodWord(p.method), p.saleId, p.notes]),
  );

  addTable(
    wb,
    SHEETS.expenses[lang],
    lang,
    [
      { key: 'id', kind: 'text', width: 12 },
      { key: 'date', kind: 'date' },
      { key: 'description', kind: 'text', width: 30 },
      { key: 'category', kind: 'text', width: 18 },
      { key: 'supplier', kind: 'text', width: 24 },
      { key: 'batch', kind: 'text', width: 10 },
      { key: 'amount', kind: 'money' },
      { key: 'paidOn', kind: 'date' },
      { key: 'dueDate', kind: 'date', width: 14 },
    ],
    byDate(data.expenses).map((e) => [
      e.id,
      e.date,
      e.description,
      categoryName.get(e.categoryId) ?? '',
      e.supplierId ? (supplierName.get(e.supplierId) ?? '') : '',
      e.batchId ? (batchCode.get(e.batchId) ?? '') : '',
      euros(e.amount),
      e.paidOn,
      e.dueDate,
    ]),
  );

  const cs = clientSummaries(data, today, alloc);
  const byName = <T extends { name: string }>(xs: T[]) => [...xs].sort((a, b) => a.name.localeCompare(b.name, lang));
  addTable(
    wb,
    SHEETS.clients[lang],
    lang,
    [
      { key: 'id', kind: 'text', width: 12 },
      { key: 'name', kind: 'text', width: 30 },
      { key: 'email', kind: 'text', width: 26 },
      { key: 'phone', kind: 'text', width: 16 },
      { key: 'bought', kind: 'money' },
      { key: 'received', kind: 'money' },
      { key: 'open', kind: 'money' },
      { key: 'notes', kind: 'text', width: 30 },
      { key: 'archived', kind: 'text', width: 12 },
    ],
    byName(data.clients).map((c) => {
      const s = cs.get(c.id);
      return [c.id, c.name, c.email, c.phone, euros(s?.sold ?? 0), euros(s?.received ?? 0), euros(s?.outstanding ?? 0), c.notes, c.archived ? w('yes') : ''];
    }),
  );

  const owed = new Map(supplierOwed(data, today).map((o) => [o.supplierId, o.total]));
  addTable(
    wb,
    SHEETS.suppliers[lang],
    lang,
    [
      { key: 'id', kind: 'text', width: 12 },
      { key: 'name', kind: 'text', width: 30 },
      { key: 'email', kind: 'text', width: 26 },
      { key: 'phone', kind: 'text', width: 16 },
      { key: 'owed', kind: 'money', width: 16 },
      { key: 'notes', kind: 'text', width: 30 },
      { key: 'archived', kind: 'text', width: 12 },
    ],
    byName(data.suppliers).map((s) => [s.id, s.name, s.email, s.phone, euros(owed.get(s.id) ?? 0), s.notes, s.archived ? w('yes') : '']),
  );

  addTable(
    wb,
    SHEETS.products[lang],
    lang,
    [
      { key: 'id', kind: 'text', width: 12 },
      { key: 'name', kind: 'text', width: 30 },
      { key: 'unit', kind: 'text', width: 10 },
      { key: 'defaultPrice', kind: 'money', width: 16 },
      { key: 'archived', kind: 'text', width: 12 },
    ],
    byName(data.products).map((p) => [p.id, p.name, p.unit, euros(p.defaultPrice), p.archived ? w('yes') : '']),
  );

  const bs = batchStats(data);
  addTable(
    wb,
    SHEETS.batches[lang],
    lang,
    [
      { key: 'code', kind: 'text', width: 10 },
      { key: 'product', kind: 'text' },
      { key: 'producedOn', kind: 'date', width: 13 },
      { key: 'produced', kind: 'int' },
      { key: 'sold', kind: 'int' },
      { key: 'left', kind: 'int' },
      { key: 'costs', kind: 'money' },
      { key: 'revenue', kind: 'money' },
      { key: 'profit', kind: 'money' },
      { key: 'costPerUnit', kind: 'money', width: 15 },
    ],
    [...data.batches]
      .sort((a, b) => (a.producedOn < b.producedOn ? -1 : a.producedOn > b.producedOn ? 1 : 0))
      .map((b) => {
        const s = bs.get(b.id);
        return [
          b.code,
          productName.get(b.productId) ?? '',
          b.producedOn,
          b.quantity,
          s?.unitsSold ?? 0,
          s?.unitsLeft ?? b.quantity,
          euros(s?.costs ?? 0),
          euros(s?.revenue ?? 0),
          euros(s?.profit ?? 0),
          s?.costPerUnit == null ? null : euros(s.costPerUnit),
        ];
      }),
  );

  return wb;
}

export async function workbookBytes(wb: ExcelJSTypes.Workbook): Promise<Uint8Array<ArrayBuffer>> {
  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf as ArrayBuffer);
}

/** "Pittig Finances 2026-11-10.xlsx" */
export function exportFileName(today: ISODate = todayFn(), extra?: string): string {
  const safe = extra ? ' ' + extra.replace(/[\\/:*?"<>|]+/g, '').trim() : '';
  return `Pittig Finances${safe} ${today}.xlsx`;
}

async function defaultStorage(): Promise<Storage> {
  const { getStorage } = await import('../storage');
  return getStorage();
}

/** Export everything to one .xlsx and let the user save it. false = cancelled. */
export async function exportAll(data: AppData, storage?: Storage, lang: Language = data.settings.language): Promise<boolean> {
  const wb = await buildWorkbook(data, lang);
  const bytes = await workbookBytes(wb);
  return (storage ?? (await defaultStorage())).saveFile(bytes, exportFileName(), XLSX_MIME);
}

export interface StatementLine {
  date: ISODate;
  kind: 'sale' | 'payment';
  description: string;
  /** Sale total (amount the client owes more). */
  charge: Cents;
  /** Payment amount. */
  credit: Cents;
  /** Running balance after this line (positive = client owes). */
  balance: Cents;
}

/** Chronological sales + payments of one client with running balance. Sales before payments on the same day. */
export function clientStatementLines(data: AppData, clientId: Id, lang: Language = data.settings.language): StatementLine[] {
  const productName = new Map(data.products.map((p) => [p.id, p.name]));
  type Ev = Omit<StatementLine, 'balance'> & { order: number };
  const evs: Ev[] = [];
  for (const s of data.sales) {
    if (s.clientId !== clientId) continue;
    const desc = s.items.map((i) => `${i.quantity}× ${productName.get(i.productId) ?? ''}`.trim()).join(', ');
    evs.push({ date: s.date, kind: 'sale', description: desc, charge: saleTotal(s), credit: 0, order: 0 });
  }
  for (const p of data.payments) {
    if (p.clientId !== clientId) continue;
    const m = p.method ? WORDS[p.method][lang] : '';
    evs.push({ date: p.date, kind: 'payment', description: [m, p.notes].filter(Boolean).join(' – '), charge: 0, credit: p.amount, order: 1 });
  }
  evs.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.order - b.order));
  let bal = 0;
  return evs.map(({ order: _o, ...e }) => {
    bal += e.charge - e.credit;
    return { ...e, balance: bal };
  });
}

export async function buildClientStatement(data: AppData, clientId: Id, lang: Language = data.settings.language, today: ISODate = todayFn()): Promise<ExcelJSTypes.Workbook> {
  const ExcelJS = await loadExcelJS();
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Pittig Finances';
  const client = data.clients.find((c) => c.id === clientId);
  const lines = clientStatementLines(data, clientId, lang);
  const w = (k: keyof typeof WORDS) => WORDS[k][lang];
  const totalCharge = lines.reduce((t, l) => t + l.charge, 0);
  const totalCredit = lines.reduce((t, l) => t + l.credit, 0);
  const ws = addTable(
    wb,
    SHEETS.statement[lang],
    lang,
    [
      { key: 'date', kind: 'date' },
      { key: 'type', kind: 'text', width: 12 },
      { key: 'description', kind: 'text', width: 40 },
      { key: 'sold', kind: 'money' },
      { key: 'received', kind: 'money' },
      { key: 'balance', kind: 'money' },
    ],
    lines.map((l) => [l.date, w(l.kind), l.description, l.charge ? euros(l.charge) : null, l.credit ? euros(l.credit) : null, euros(l.balance)]),
    { totalRow: [null, COLS.total[lang], null, euros(totalCharge), euros(totalCredit), euros(totalCharge - totalCredit)], filter: false },
  );
  // Title rows above the table.
  ws.spliceRows(1, 0, [WORDS.statementFor[lang].replace('{name}', client?.name ?? '')], [WORDS.generated[lang].replace('{date}', formatDate(today, lang, 'long'))], []);
  ws.getRow(1).font = { bold: true, size: 14 };
  ws.getRow(2).font = { italic: true, color: { argb: 'FF6E6E73' } };
  ws.getRow(4).font = { bold: true };
  ws.views = [{ state: 'frozen', ySplit: 4 }];
  return wb;
}

/** Export one client's statement (sales, payments, running balance). false = cancelled. */
export async function exportClientStatement(data: AppData, clientId: Id, storage?: Storage, lang: Language = data.settings.language): Promise<boolean> {
  const wb = await buildClientStatement(data, clientId, lang);
  const bytes = await workbookBytes(wb);
  const name = data.clients.find((c) => c.id === clientId)?.name;
  return (storage ?? (await defaultStorage())).saveFile(bytes, exportFileName(todayFn(), name), XLSX_MIME);
}

/**
 * Empty template: a "Bank" sheet (Date, Description, Counterparty, Amount) for rows to sort, plus
 * empty Clients / Suppliers / Products sheets in our own format.
 */
export async function buildTemplate(lang: Language): Promise<ExcelJSTypes.Workbook> {
  const ExcelJS = await loadExcelJS();
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Pittig Finances';
  addTable(wb, lang === 'nl' ? 'Bank' : 'Bank', lang, [
    { key: 'date', kind: 'date' },
    { key: 'description', kind: 'text', width: 36 },
    { key: 'counterparty', kind: 'text', width: 28 },
    { key: 'amount', kind: 'money' },
  ], []);
  addTable(wb, SHEETS.clients[lang], lang, [
    { key: 'id', kind: 'text', width: 12 },
    { key: 'name', kind: 'text', width: 30 },
    { key: 'email', kind: 'text', width: 26 },
    { key: 'phone', kind: 'text', width: 16 },
    { key: 'notes', kind: 'text', width: 30 },
  ], []);
  addTable(wb, SHEETS.suppliers[lang], lang, [
    { key: 'id', kind: 'text', width: 12 },
    { key: 'name', kind: 'text', width: 30 },
    { key: 'email', kind: 'text', width: 26 },
    { key: 'phone', kind: 'text', width: 16 },
    { key: 'notes', kind: 'text', width: 30 },
  ], []);
  addTable(wb, SHEETS.products[lang], lang, [
    { key: 'id', kind: 'text', width: 12 },
    { key: 'name', kind: 'text', width: 30 },
    { key: 'unit', kind: 'text', width: 10 },
    { key: 'defaultPrice', kind: 'money', width: 16 },
  ], []);
  return wb;
}

export async function exportTemplate(lang: Language, storage?: Storage): Promise<boolean> {
  const bytes = await workbookBytes(await buildTemplate(lang));
  const name = lang === 'nl' ? 'Pittig Finances sjabloon.xlsx' : 'Pittig Finances template.xlsx';
  return (storage ?? (await defaultStorage())).saveFile(bytes, name, XLSX_MIME);
}
