import { describe, expect, it } from 'vitest';
import { demoData } from '../domain/fixtures';
import { emptyData } from '../domain/migrate';
import type { AppData, ImportRow } from '../domain/types';
import { buildClientStatement, buildWorkbook, clientStatementLines, exportClientStatement, exportFileName, workbookBytes } from './export';
import { buildImportRows, findEntitySheets, normalizeSource, planEntityImport } from './import';
import { exactNameMatch, fuzzyNameMatch, namesAlike, expenseFromRow, linkRow, matchSuggestions, paymentFromRow, reopenRow } from './match';
import { parseAmountCell, parseDateCell, readWorkbook, type ParsedRow } from './parse';

const REF = '2026-03-31';

function row(p: Partial<ParsedRow> & { date: string; amount: number }): ParsedRow {
  return { line: 1, description: 'x', ...p };
}

describe('buildImportRows / dedupe', () => {
  const parsed: ParsedRow[] = [
    row({ date: '2026-03-01', amount: 1250, description: 'Factuur 1', counterparty: 'Toko Sari' }),
    row({ date: '2026-03-02', amount: -500, description: 'Marktgeld' }),
    row({ date: '2026-03-02', amount: -500, description: 'Marktgeld' }), // genuine second identical fee
    { line: 9, date: null, amount: 100, description: 'bad', error: 'date' },
  ];

  it('creates todo rows with fingerprints and counts invalid rows', () => {
    const r = buildImportRows(parsed, 'ING.csv', [], new Date('2026-03-31T10:00:00Z'));
    expect(r.invalid).toBe(1);
    expect(r.duplicates).toBe(0);
    expect(r.rows).toHaveLength(3);
    expect(r.rows[0]).toMatchObject({ date: '2026-03-01', amount: 1250, status: 'todo', counterparty: 'Toko Sari', source: 'ING.csv', fingerprint: '2026-03-01|1250|factuur 1' });
    expect(r.rows[2]!.fingerprint).toBe('2026-03-02|-500|marktgeld#2');
  });

  it('skips everything when the same file is imported again (also as "ING (1).csv")', () => {
    const first = buildImportRows(parsed, 'ING.csv', []);
    const again = buildImportRows(parsed, 'ING (1).csv', first.rows);
    expect(again.rows).toHaveLength(0);
    expect(again.duplicates).toBe(3);
  });

  it('adds only new rows from an overlapping export', () => {
    const first = buildImportRows(parsed.slice(0, 2), 'ING.csv', []);
    const second = buildImportRows(parsed, 'ING.csv', first.rows);
    expect(second.rows.map((r) => r.fingerprint)).toEqual(['2026-03-02|-500|marktgeld#2']);
    expect(second.duplicates).toBe(2);
  });

  it('skips shared rows of overlapping downloads with different file names (review #3)', () => {
    const jan = buildImportRows([row({ date: '2026-03-05', amount: -1250, description: 'Makro' })], 'NL01INGB_01-01-2026_31-03-2026.csv', []);
    const mar = buildImportRows(
      [row({ date: '2026-03-05', amount: -1250, description: 'Makro' }), row({ date: '2026-04-02', amount: -800, description: 'Makro' })],
      'NL01INGB_01-03-2026_30-04-2026.csv',
      jan.rows,
    );
    expect(mar.duplicates).toBe(1);
    expect(mar.rows.map((r) => r.date)).toEqual(['2026-04-02']);
  });

  it('dedupes against rows stored by older versions (fingerprint with |source) (review #3)', () => {
    const legacy: ImportRow[] = [
      { id: 'a', date: '2026-03-02', amount: -500, description: 'Marktgeld', source: 'old.csv', fingerprint: '2026-03-02|-500|marktgeld|old.csv', status: 'done', importedAt: '2026-03-03T00:00:00Z' },
      { id: 'b', date: '2026-03-02', amount: -500, description: 'Marktgeld', source: 'old.csv', fingerprint: '2026-03-02|-500|marktgeld|old.csv#2', status: 'todo', importedAt: '2026-03-03T00:00:00Z' },
    ];
    const r = buildImportRows(parsed, 'new-name.csv', legacy);
    expect(r.duplicates).toBe(2);
    expect(r.rows.map((x) => x.description)).toEqual(['Factuur 1']);
  });

  it('normalizes browser download suffixes', () => {
    expect(normalizeSource('ING (2).csv')).toBe('ING.csv');
    expect(normalizeSource('rabo.csv')).toBe('rabo.csv');
  });
});

describe('own format round trip', () => {
  it('export → import of clients/suppliers/products matches by ID and never duplicates', async () => {
    const data = demoData(REF);
    const wb = await buildWorkbook(data, 'nl', REF);
    const read = await readWorkbook(await workbookBytes(wb), exportFileName(REF));
    const sheets = findEntitySheets(read);
    expect(sheets.map((s) => s.kind).sort()).toEqual(['clients', 'products', 'suppliers']);

    // Unchanged data → nothing to do.
    const same = planEntityImport(data, sheets);
    expect(same.created).toBe(0);
    expect(same.updated).toBe(0);
    expect(same.clients).toHaveLength(0);
    expect(same.unchanged).toBe(data.clients.length + data.suppliers.length + data.products.length);

    // Into an empty dataset → everything created once.
    const fresh = planEntityImport(emptyData(), sheets);
    expect(fresh.clients.map((c) => c.name).sort()).toEqual(data.clients.map((c) => c.name).sort());
    expect(fresh.products.find((p) => p.name === 'Sambal Pittig')).toMatchObject({ unit: 'pot', defaultPrice: 650, archived: false });
    expect(fresh.created).toBe(data.clients.length + data.suppliers.length + data.products.length);
  });

  it('updates by ID, then by name (case-insensitive), and creates new ones', async () => {
    const data = demoData(REF);
    const wb = await buildWorkbook(data, 'en', REF);
    const clients = wb.getWorksheet('Clients')!;
    // Row 2.. sorted by name; find rows by id.
    clients.eachRow((r, n) => {
      if (n === 1) return;
      if (r.getCell(1).value === 'demo-c-toko') r.getCell(3).value = 'toko@example.nl';
      if (r.getCell(1).value === 'demo-c-hoekje') {
        r.getCell(1).value = null; // no ID → match by name
        r.getCell(2).value = 'CAFÉ HET HOEKJE';
        r.getCell(4).value = '030-1234567';
      }
    });
    clients.addRow([null, 'Nieuwe Klant', 'nieuw@example.nl']);
    clients.addRow([null, 'nieuwe klant']); // same name again in the file → not a second client
    const products = wb.getWorksheet('Products')!;
    products.eachRow((r) => {
      if (r.getCell(1).value === 'demo-p-sambal') r.getCell(4).value = 7.25;
    });
    const read = await readWorkbook(await workbookBytes(wb), 'export.xlsx');
    const plan = planEntityImport(data, findEntitySheets(read));
    expect(plan.clients.find((c) => c.id === 'demo-c-toko')?.email).toBe('toko@example.nl');
    expect(plan.clients.find((c) => c.id === 'demo-c-hoekje')).toMatchObject({ name: 'CAFÉ HET HOEKJE', phone: '030-1234567' });
    const created = plan.clients.filter((c) => !data.clients.some((x) => x.id === c.id));
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ name: 'nieuwe klant', email: 'nieuw@example.nl', archived: false });
    expect(plan.products.find((p) => p.id === 'demo-p-sambal')?.defaultPrice).toBe(725);
    expect(plan.created).toBe(1);
    expect(plan.updated).toBe(3);
  });
});

describe('export workbook', () => {
  it('has localized sheets with real number and date cells', async () => {
    const data = demoData(REF);
    const nl = await buildWorkbook(data, 'nl', REF);
    expect(nl.worksheets.map((w) => w.name)).toEqual(['Overzicht', 'Verkopen', 'Betalingen', 'Uitgaven', 'Klanten', 'Leveranciers', 'Producten', 'Batches']);
    const en = await buildWorkbook(data, 'en', REF);
    expect(en.worksheets.map((w) => w.name)).toEqual(['Summary', 'Sales', 'Payments', 'Expenses', 'Clients', 'Suppliers', 'Products', 'Batches']);

    const sales = nl.getWorksheet('Verkopen')!;
    expect(sales.getRow(1).font?.bold).toBe(true);
    expect(sales.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 });
    const itemCount = data.sales.reduce((n, s) => n + s.items.length, 0);
    expect(sales.rowCount).toBe(itemCount + 1);
    const r2 = sales.getRow(2);
    expect(r2.getCell(2).value).toBeInstanceOf(Date);
    expect(typeof r2.getCell(8).value).toBe('number');
    expect(sales.getColumn(8).numFmt).toContain('€');

    const read = await readWorkbook(await workbookBytes(nl), 'x.xlsx');
    const expenses = read.sheets.find((s) => s.name === 'Uitgaven')!;
    const first = [...data.expenses].sort((a, b) => (a.date < b.date ? -1 : 1))[0]!;
    expect(parseDateCell(expenses.rows[1]![1]!)).toBe(first.date);
    expect(parseAmountCell(expenses.rows[1]![6]!)).toBe(first.amount);

    const summary = nl.getWorksheet('Overzicht')!;
    const last = summary.getRow(summary.rowCount);
    expect(last.getCell(1).value).toBe('Totaal');
    expect(last.font?.bold).toBe(true);
  });

  it('client statement has a running balance equal to the open balance', async () => {
    const data = demoData(REF);
    const lines = clientStatementLines(data, 'demo-c-toko', 'nl');
    const sold = data.sales.filter((s) => s.clientId === 'demo-c-toko').length;
    const paid = data.payments.filter((p) => p.clientId === 'demo-c-toko').length;
    expect(lines).toHaveLength(sold + paid);
    const last = lines[lines.length - 1]!;
    const { clientSummary } = await import('../domain/calc');
    expect(last.balance).toBe(clientSummary(data, 'demo-c-toko', REF).outstanding);
    const wb = await buildClientStatement(data, 'demo-c-toko', 'nl', REF);
    const ws = wb.worksheets[0]!;
    expect(String(ws.getCell('A1').value)).toContain('Toko Sari');
    expect(ws.getRow(4).getCell(1).value).toBe('Datum');

    let saved: { name: string; mime: string } | null = null;
    const storage = { saveFile: async (_b: unknown, name: string, mime: string) => ((saved = { name, mime }), true) };
    await expect(exportClientStatement(data, 'demo-c-toko', storage as never)).resolves.toBe(true);
    expect(saved!.name).toMatch(/^Pittig Finances Toko Sari \d{4}-\d{2}-\d{2}\.xlsx$/);
  });

  it('exports an empty dataset without errors', async () => {
    const wb = await buildWorkbook(emptyData(), 'nl', REF);
    expect(wb.worksheets).toHaveLength(8);
    expect(exportFileName('2026-11-10')).toBe('Pittig Finances 2026-11-10.xlsx');
  });
});

describe('match suggestions', () => {
  const base = (): AppData => {
    const d = emptyData();
    d.clients = [{ id: 'c1', name: 'Toko Sari', archived: false }];
    d.suppliers = [{ id: 's1', name: 'Verpakking Direct', archived: false }];
    d.payments = [
      { id: 'p1', date: '2026-03-10', clientId: 'c1', amount: 2500 },
      { id: 'p2', date: '2026-03-20', clientId: 'c1', amount: 2500 }, // 10 days off
      { id: 'p3', date: '2026-03-12', clientId: 'c1', amount: 2600 },
      { id: 'p4', date: '2026-03-08', clientId: 'c1', amount: 2500 }, // already linked
    ];
    d.expenses = [
      { id: 'e1', date: '2026-03-01', categoryId: d.categories[0]!.id, description: 'Potten', amount: 4000, paidOn: '2026-03-09' },
      { id: 'e2', date: '2026-03-09', categoryId: d.categories[0]!.id, description: 'Iets', amount: 4000, paidOn: null },
    ];
    d.importRows = [
      { id: 'r0', date: '2026-03-08', description: 'x', amount: 2500, source: 's', fingerprint: 'f0', status: 'done', linkedId: 'p4', linkedCollection: 'payments', importedAt: '' },
    ];
    return d;
  };
  const ir = (amount: number, date = '2026-03-10'): ImportRow => ({ id: 'r1', date, description: 'Betaling', amount, source: 's', fingerprint: 'f', status: 'todo', importedAt: '', counterparty: 'TOKO SARI' });

  it('suggests payments with the same amount within 7 days, not already linked', () => {
    const s = matchSuggestions(base(), ir(2500, '2026-03-11'));
    expect(s.map((x) => x.item.id)).toEqual(['p1']);
  });

  it('suggests expenses for money out (by paid date or date), closest first', () => {
    const s = matchSuggestions(base(), ir(-4000, '2026-03-10'));
    expect(s.map((x) => x.item.id)).toEqual(['e1', 'e2']);
    expect(s[0]!.collection).toBe('expenses');
  });

  it('suggests an unpaid bill with the same amount dated weeks earlier, supplier name match first (UX review #2)', () => {
    const d = base();
    d.suppliers = [{ id: 's1', name: 'Verpakking Direct', archived: false }];
    d.expenses.push(
      { id: 'e3', date: '2026-10-20', categoryId: d.categories[0]!.id, description: 'Losse bon', amount: 12000, paidOn: '2026-11-03' },
      { id: 'e4', date: '2026-10-20', categoryId: d.categories[0]!.id, supplierId: 's1', description: '150 potten', amount: 12000, paidOn: null },
      { id: 'e5', date: '2026-05-01', categoryId: d.categories[0]!.id, description: 'Te oud', amount: 12000, paidOn: null },
    );
    const row: ImportRow = { ...ir(-12000, '2026-11-03'), counterparty: 'Verpakking Direct BV' };
    const s = matchSuggestions(d, row);
    expect(s.map((x) => x.item.id)).toEqual(['e4', 'e3']);
    expect(s[0]).toMatchObject({ unpaid: true, nameMatch: true });
    expect(fuzzyNameMatch(d.suppliers, 'Verpakking Direct BV')).toBe('s1');
    expect(fuzzyNameMatch(d.suppliers, 'Drukkerij Direct')).toBeUndefined();
    expect(namesAlike('Toko Sari', 'TOKO SARI B.V.')).toBe(true);
  });

  it('finds exact counterparty names only', () => {
    const d = base();
    expect(exactNameMatch(d.clients, 'toko sari')).toBe('c1');
    expect(exactNameMatch(d.clients, 'Toko Sari BV')).toBeUndefined();
    expect(exactNameMatch(d.clients, undefined)).toBeUndefined();
  });

  it('creates payment/expense from a row and links/reopens', () => {
    const r = ir(2500);
    const p = paymentFromRow(r, 'c1', 'sale1');
    expect(p).toMatchObject({ date: '2026-03-10', clientId: 'c1', amount: 2500, saleId: 'sale1', method: 'bank', notes: 'Betaling' });
    const e = expenseFromRow(ir(-4000), { categoryId: 'cat', supplierId: 's1' });
    expect(e).toMatchObject({ amount: 4000, paidOn: '2026-03-10', supplierId: 's1', description: 'Betaling' });
    expect(e).not.toHaveProperty('batchId');
    const linked = linkRow(r, 'payments', p.id);
    expect(linked).toMatchObject({ status: 'done', linkedId: p.id, linkedCollection: 'payments' });
    const back = reopenRow(linked);
    expect(back.status).toBe('todo');
    expect(back).not.toHaveProperty('linkedId');
  });
});
