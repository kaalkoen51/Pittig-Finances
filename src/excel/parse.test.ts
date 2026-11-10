import { describe, expect, it } from 'vitest';
import { detectSeparator, parseCsv } from './csv';
import {
  cellText,
  detectHeaderRow,
  directionSign,
  excelSerialToISO,
  guessMapping,
  parseAmountCell,
  parseDateCell,
  parseRows,
  readWorkbook,
  type Cell,
} from './parse';

describe('parseAmountCell', () => {
  it.each<[Cell, number | null]>([
    ['1.234,56', 123456],
    ['-12,50', -1250],
    ['€ 12,50', 1250],
    ['"€ 12,50"', null],
    ['1,234.56', 123456],
    ['+3,00', 300],
    ['12,50-', -1250],
    ['0,05', 5],
    ['1234.5', 123450],
    [12.5, 1250],
    [-0.1, -10],
    [1234.565, 123457],
    ['', null],
    ['abc', null],
    [null, null],
    [true, null],
  ])('%j → %j', (input, cents) => {
    expect(parseAmountCell(input)).toBe(cents);
  });
});

describe('parseDateCell', () => {
  it.each<[Cell, string | null]>([
    ['12-03-2026', '2026-03-12'],
    ['1-3-26', '2026-03-01'],
    ['2026-03-12', '2026-03-12'],
    ['20260312', '2026-03-12'],
    ['12/03/2026', '2026-03-12'],
    ['12.03.2026', '2026-03-12'],
    [20260312, '2026-03-12'],
    [46093, '2026-03-12'],
    [46093.75, '2026-03-12'],
    ['31-02-2026', null],
    ['hello', null],
    [5, null],
    [null, null],
  ])('%j → %j', (input, iso) => {
    expect(parseDateCell(input)).toBe(iso);
  });

  it('reads Date cells as calendar dates regardless of time zone offset', () => {
    expect(parseDateCell(new Date(Date.UTC(2026, 2, 12)))).toBe('2026-03-12');
    // A writer that stored local midnight in UTC+2 (= 22:00 the day before, UTC) still rounds to the 12th.
    expect(parseDateCell(new Date(Date.UTC(2026, 2, 11, 22)))).toBe('2026-03-12');
    expect(parseDateCell(new Date('invalid'))).toBeNull();
  });

  it('converts Excel serials', () => {
    expect(excelSerialToISO(45658)).toBe('2025-01-01');
    expect(excelSerialToISO(100)).toBeNull();
  });
});

describe('directionSign', () => {
  it('understands Af/Bij and Debit/Credit', () => {
    expect(directionSign('Af')).toBe(-1);
    expect(directionSign('Bij')).toBe(1);
    expect(directionSign('Debit')).toBe(-1);
    expect(directionSign('CREDIT')).toBe(1);
    expect(directionSign('D')).toBe(-1);
    expect(directionSign('C')).toBe(1);
    expect(directionSign('foo')).toBeNull();
    expect(directionSign(null)).toBeNull();
  });
});

describe('parseCsv', () => {
  it('detects semicolon and handles quotes, BOM and CRLF', () => {
    const text = '﻿"Datum";"Naam / Omschrijving";"Bedrag (EUR)"\r\n"20260312";"Toko ""Sari""; Utrecht";"12,50"\r\n';
    expect(detectSeparator(text)).toBe(';');
    expect(parseCsv(text)).toEqual([
      ['Datum', 'Naam / Omschrijving', 'Bedrag (EUR)'],
      ['20260312', 'Toko "Sari"; Utrecht', '12,50'],
    ]);
  });

  it('detects comma with quoted Dutch numbers (Rabobank style)', () => {
    const text = '"IBAN/BBAN","Datum","Bedrag","Naam tegenpartij"\n"NL01RABO0123456789","2026-03-12","-12,50","Drukkerij, Van Dam"\n';
    expect(detectSeparator(text)).toBe(',');
    const rows = parseCsv(text);
    expect(rows[1]).toEqual(['NL01RABO0123456789', '2026-03-12', '-12,50', 'Drukkerij, Van Dam']);
  });

  it('handles tab separator, newlines inside quotes, empty lines and unquoted spaces', () => {
    const text = 'a\tb\n\n 1 \t"x\ny"\n';
    expect(detectSeparator(text)).toBe('\t');
    expect(parseCsv(text)).toEqual([
      ['a', 'b'],
      ['1', 'x\ny'],
    ]);
  });

  it('handles a final line without newline and empty fields', () => {
    expect(parseCsv('a;b;c\n1;;3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '', '3'],
    ]);
  });

  it('prefers ; when commas only appear in decimals', () => {
    expect(detectSeparator('Datum;Bedrag\n12-03-2026;12,50\n13-03-2026;1,00\n')).toBe(';');
  });
});

describe('header detection and column guessing', () => {
  it('guesses ING columns incl. Af/Bij and applies the sign', () => {
    const csv =
      '"Datum";"Naam / Omschrijving";"Rekening";"Tegenrekening";"Code";"Af Bij";"Bedrag (EUR)";"Mutatiesoort";"Mededelingen";"Saldo na mutatie";"Tag"\n' +
      '"20260312";"Toko Sari";"NL01INGB0001";"NL02RABO0002";"GT";"Bij";"125,00";"Online bankieren";"Factuur 12";"1.000,00";""\n' +
      '"20260313";"Verpakking Direct";"NL01INGB0001";"NL03ABNA0003";"IC";"Af";"1.234,56";"Incasso";"Potten";"0,00";""\n';
    const rows = parseCsv(csv);
    const h = detectHeaderRow(rows);
    expect(h).toBe(0);
    const m = guessMapping(rows[0]!, rows.slice(1));
    expect(m).toEqual({ date: 0, amount: 6, direction: 5, counterparty: 1, description: 8 });
    const parsed = parseRows(rows, h, m);
    expect(parsed).toEqual([
      { line: 2, date: '2026-03-12', amount: 12500, description: 'Factuur 12', counterparty: 'Toko Sari' },
      { line: 3, date: '2026-03-13', amount: -123456, description: 'Potten', counterparty: 'Verpakking Direct' },
    ]);
  });

  it('guesses Rabobank columns and skips Rentedatum / Saldo', () => {
    const header = ['IBAN/BBAN', 'Munt', 'BIC', 'Volgnr', 'Datum', 'Rentedatum', 'Bedrag', 'Saldo na trn', 'Tegenrekening IBAN/BBAN', 'Naam tegenpartij', 'Naam uiteindelijke partij', 'Omschrijving-1', 'Omschrijving-2'];
    const m = guessMapping(header);
    expect(m.date).toBe(4);
    expect(m.amount).toBe(6);
    expect(m.counterparty).toBe(9);
    expect(m.description).toBe(11);
    expect(m.direction).toBe(-1);
  });

  it('guesses English headers', () => {
    const m = guessMapping(['Date', 'Description', 'Counterparty', 'Amount', 'Balance']);
    expect(m).toEqual({ date: 0, amount: 3, direction: -1, counterparty: 2, description: 1 });
  });

  it('finds a header row below title lines', () => {
    const rows: Cell[][] = [['Rekeningoverzicht'], ['Periode: maart'], [], ['Datum', 'Omschrijving', 'Bedrag'], ['01-03-2026', 'Markt', '-25,00']];
    expect(detectHeaderRow(rows)).toBe(3);
  });

  it('ignores a "Type" column whose values are not directions', () => {
    const rows: Cell[][] = [
      ['Type', 'Started Date', 'Description', 'Amount'],
      ['CARD_PAYMENT', '2026-03-01', 'Shop', '-5.00'],
    ];
    const m = guessMapping(rows[0]!, rows.slice(1));
    expect(m.direction).toBe(-1);
    expect(m.date).toBe(1);
    expect(m.amount).toBe(3);
  });

  it('falls back to content when headers are unknown', () => {
    const rows: Cell[][] = [
      ['A', 'B', 'C'],
      ['x', '12-03-2026', '12,50'],
    ];
    const m = guessMapping(rows[0]!, rows.slice(1));
    expect(m.date).toBe(1);
    expect(m.amount).toBe(2);
    expect(m.description).toBe(0);
  });

  it('marks rows with unreadable date or amount and uses counterparty as description fallback', () => {
    const rows: Cell[][] = [
      ['Datum', 'Naam', 'Bedrag'],
      ['xx', 'A', '1'],
      ['01-01-2026', 'B', 'nope'],
      ['01-01-2026', 'C', 5],
    ];
    const parsed = parseRows(rows, 0, guessMapping(rows[0]!));
    expect(parsed.map((p) => p.error)).toEqual(['date', 'amount', undefined]);
    expect(parsed[2]).toMatchObject({ description: 'C', counterparty: 'C', amount: 500 });
  });
});

describe('readWorkbook', () => {
  it('reads CSV bytes (Windows-1252 fallback)', async () => {
    const bytes = new Uint8Array([...new TextEncoder().encode('Datum;Omschrijving;Bedrag\n01-03-2026;Caf'), 0xe9, ...new TextEncoder().encode(';-3,50\n')]);
    const wb = await readWorkbook(bytes, 'bank.csv');
    expect(wb.kind).toBe('csv');
    expect(wb.sheets[0]!.rows[1]).toEqual(['01-03-2026', 'Café', '-3,50']);
  });

  it('reads xlsx with dates, numbers, rich text and formulas', async () => {
    const { loadExcelJS } = await import('./parse');
    const ExcelJS = await loadExcelJS();
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Blad1');
    ws.addRow(['Datum', 'Omschrijving', 'Bedrag']);
    ws.addRow([new Date(Date.UTC(2026, 2, 12)), { richText: [{ text: 'Toko ' }, { text: 'Sari' }] }, 12.5]);
    ws.addRow([new Date(Date.UTC(2026, 2, 13)), 'Formula', { formula: 'C2*2', result: 25 }]);
    wb.addWorksheet('Leeg');
    const buf = new Uint8Array((await wb.xlsx.writeBuffer()) as ArrayBuffer);
    const read = await readWorkbook(buf, 'test.xlsx');
    expect(read.sheets.map((s) => s.name)).toEqual(['Blad1']);
    const rows = read.sheets[0]!.rows;
    expect(parseDateCell(rows[1]![0]!)).toBe('2026-03-12');
    expect(cellText(rows[1]![1]!)).toBe('Toko Sari');
    expect(parseAmountCell(rows[2]![2]!)).toBe(2500);
  });

  it('rejects unsupported files', async () => {
    await expect(readWorkbook(new Uint8Array([1, 2]), 'x.pdf')).rejects.toMatchObject({ code: 'unsupported' });
    await expect(readWorkbook(new Uint8Array([1, 2]), 'x.xlsx')).rejects.toMatchObject({ code: 'unreadable' });
  });
});
