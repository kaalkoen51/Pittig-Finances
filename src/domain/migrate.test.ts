import { describe, expect, it } from 'vitest';
import { demoData } from './fixtures';
import { dedupeImportRows, importFingerprint } from './importing';
import { CURRENT_VERSION, emptyData, migrate, parseAppData, serializeAppData, validate } from './migrate';

describe('validate', () => {
  it('accepts empty and demo data', () => {
    expect(validate(emptyData()).ok).toBe(true);
    const r = validate(demoData('2026-03-31'));
    if (!r.ok) throw new Error(r.error);
  });

  it('rejects non-integer cents', () => {
    const d = demoData('2026-03-31');
    d.expenses[0]!.amount = 12.5;
    const r = validate(d);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('expenses[0].amount');
  });

  it('rejects bad dates, missing lists and wrong enums', () => {
    const d = demoData('2026-03-31') as unknown as Record<string, unknown>;
    (d.sales as { date: string }[])[0]!.date = '31-03-2026';
    delete d.clients;
    (d.importRows as { status: string }[])[0]!.status = 'maybe';
    const r = validate(d);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain('sales[0].date');
      expect(r.error).toContain('clients');
      expect(r.error).toContain('importRows[0].status');
    }
  });

  it('requires paidOn to be a date or null', () => {
    const d = demoData('2026-03-31') as unknown as { expenses: Record<string, unknown>[] };
    delete d.expenses[0]!.paidOn;
    expect(validate(d).ok).toBe(false);
  });
});

describe('parseAppData (corrupt file handling)', () => {
  it('round-trips', () => {
    const d = demoData('2026-03-31');
    const r = parseAppData(serializeAppData(d));
    expect(r).toEqual({ ok: true, data: d });
  });
  it.each([
    ['', 'Not valid JSON'],
    ['{"version":1,"clients":[', 'Not valid JSON'],
    ['null', 'not an object'],
    ['[]', 'not an object'],
    ['{"version":99}', 'newer app version'],
    ['{"version":"x"}', 'Invalid version'],
    ['{"version":1}', 'clients'],
    // review #1: JSON without version is only accepted when it looks like a Pittig draft
    ['{"name":"x"}', 'Not a Pittig data file'],
    ['{"name":"pittig-finances","dependencies":{}}', 'Not a Pittig data file'],
    ['{"clients":"oops","sales":{"a":1}}', 'Not a Pittig data file'],
  ])('reports %s as corrupt', (text, msg) => {
    const r = parseAppData(text);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain(msg);
  });
});

describe('migrate', () => {
  it('leaves current data alone', () => {
    const d = emptyData();
    expect(migrate(d)).toEqual({ data: d });
  });

  it('upgrades a v0 draft (no version, currency, Category.kind)', () => {
    const v0 = {
      clients: [{ id: 'c1', name: 'Toko' }],
      suppliers: [],
      products: [{ id: 'p1', name: 'Sambal', unit: 'pot', defaultPrice: 650 }],
      batches: [{ id: 'b1', productId: 'p1', code: 'S1', producedOn: '2026-01-01', quantity: 10 }],
      sales: [],
      payments: [],
      expenses: [{ id: 'e1', date: '2026-01-02', categoryId: 'k1', description: 'Pepers', amount: 1000 }],
      categories: [
        { id: 'k1', name: 'Ingrediënten', kind: 'expense', color: '#f00' },
        { id: 'k2', name: 'Omzet', kind: 'income', color: '#0f0' },
      ],
      settings: { businessName: 'Pittig', currency: 'EUR', language: 'nl' },
    };
    const r = parseAppData(JSON.stringify(v0));
    if (!r.ok) throw new Error(r.error);
    expect(r.migratedFrom).toBe(0);
    expect(r.data.version).toBe(CURRENT_VERSION);
    expect(r.data.clients[0]!.archived).toBe(false);
    expect(r.data.batches[0]!.closed).toBe(false);
    expect(r.data.expenses[0]!.paidOn).toBeNull();
    expect(r.data.categories).toEqual([{ id: 'k1', name: 'Ingrediënten', color: '#f00', archived: false }]);
    expect(r.data.settings).toEqual({ businessName: 'Pittig', language: 'nl', firstRunDone: false });
    expect(r.data.importRows).toEqual([]);
  });
});

describe('migrate v0 never drops data silently (review #1)', () => {
  const lists = { clients: [], suppliers: [], products: [], batches: [], sales: [], payments: [], expenses: [], categories: [] };
  it('rejects a draft whose optional collection is not a list', () => {
    const r = parseAppData(JSON.stringify({ ...lists, importRows: { a: 1 } }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('importRows');
  });
  it('rejects a draft with non-object items instead of filtering them out', () => {
    const r = parseAppData(JSON.stringify({ ...lists, clients: ['Toko'] }));
    expect(r.ok).toBe(false);
  });
  it('accepts optional auto / linkCreated flags and rejects wrong types', () => {
    const d = demoData('2026-03-31');
    d.payments[0]!.auto = true;
    d.importRows[0]!.linkCreated = true;
    expect(validate(d).ok).toBe(true);
    (d.payments[0] as unknown as Record<string, unknown>).auto = 'yes';
    expect(validate(d).ok).toBe(false);
  });
});

describe('import dedupe', () => {
  it('builds fingerprints from normalized description', () => {
    expect(importFingerprint({ date: '2026-03-01', amount: -1250, description: '  Café   DE Hoek ', source: 'ing.csv' })).toBe('2026-03-01|-1250|cafe de hoek');
  });
  it('skips existing and repeated rows', () => {
    const existing = [{ fingerprint: 'a' }];
    const { fresh, duplicates } = dedupeImportRows(existing, [{ fingerprint: 'a' }, { fingerprint: 'b' }, { fingerprint: 'b' }, { fingerprint: 'c' }]);
    expect(fresh.map((r) => r.fingerprint)).toEqual(['b', 'c']);
    expect(duplicates).toBe(2);
  });
});
