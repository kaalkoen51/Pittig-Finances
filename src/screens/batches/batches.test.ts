import { describe, expect, it } from 'vitest';
import { demoData } from '../../domain/fixtures';
import type { Batch } from '../../domain/types';
import {
  batchForm,
  batchFromForm,
  isDuplicateProduct,
  parseQuantity,
  productAbbr,
  productForm,
  productFromForm,
  salesForBatch,
  siblingCodes,
  sortBatches,
  suggestBatchCode,
  validateBatchForm,
} from './batchLogic';

describe('batch code suggestion', () => {
  it('abbreviates product names', () => {
    expect(productAbbr('Sambal Pittig')).toBe('SP');
    expect(productAbbr('Habanero Hot Sauce Extra')).toBe('HHS');
    expect(productAbbr('Ketjap')).toBe('KET');
    expect(productAbbr('Crème brûlée')).toBe('CB');
    expect(productAbbr('  !! ')).toBe('B');
  });

  it('builds ABBR-YYMMDD and avoids existing codes', () => {
    expect(suggestBatchCode('Sambal Pittig', '2026-03-07', [])).toBe('SP-260307');
    expect(suggestBatchCode('Sambal Pittig', '2026-03-07', ['sp-260307'])).toBe('SP-260307-2');
    expect(suggestBatchCode('Sambal Pittig', '2026-03-07', ['SP-260307', 'SP-260307-2'])).toBe('SP-260307-3');
  });

  it('sibling codes exclude other products and itself', () => {
    const d = demoData('2026-11-10');
    expect(siblingCodes(d.batches, 'demo-p-sambal', 'demo-b-s2')).toEqual(['S-01']);
  });
});

describe('batch form', () => {
  it('parses whole quantities only', () => {
    expect(parseQuantity('120')).toBe(120);
    expect(parseQuantity('1.200')).toBe(1200);
    expect(parseQuantity('1 200')).toBe(1200);
    expect(parseQuantity('12,5')).toBeNull();
    expect(parseQuantity('-3')).toBeNull();
    expect(parseQuantity('')).toBeNull();
  });

  it('validates required fields and duplicate codes', () => {
    const f = batchForm(undefined, { producedOn: '2026-11-10' });
    expect(validateBatchForm(f, [])).toEqual({ productId: 'required', code: 'required', quantity: 'required' });
    expect(validateBatchForm({ ...f, productId: 'p', code: 's-01', quantity: 'x' }, ['S-01'])).toEqual({ code: 'codeExists', quantity: 'invalidQuantity' });
  });

  it('maps form to batch and back, keeping closed and omitting empty notes', () => {
    const orig: Batch = { id: 'b', productId: 'p', code: 'S-01', producedOn: '2026-01-02', quantity: 50, closed: true, notes: 'x' };
    expect(batchFromForm(batchForm(orig), orig)).toEqual(orig);
    const nb = batchFromForm({ productId: 'p', code: ' SP-1 ', producedOn: '2026-01-02', quantity: '10', notes: ' ' });
    expect(nb).toMatchObject({ code: 'SP-1', quantity: 10, closed: false });
    expect('notes' in nb).toBe(false);
  });

  it('sorts open batches first, newest first', () => {
    const d = demoData('2026-11-10');
    expect(sortBatches(d.batches).map((b) => b.code)).toEqual(['S-02', 'H-01', 'S-01']);
  });
});

describe('product form', () => {
  it('defaults unit and price', () => {
    const p = productFromForm({ ...productForm(undefined, 'pot'), name: ' Ketjap ', unit: '' }, undefined, 'pot');
    expect(p).toMatchObject({ name: 'Ketjap', unit: 'pot', defaultPrice: 0, archived: false });
  });
  it('detects duplicate names', () => {
    const d = demoData('2026-11-10');
    expect(isDuplicateProduct(d.products, 'sambal pittig')).toBe(true);
    expect(isDuplicateProduct(d.products, 'sambal pittig', 'demo-p-sambal')).toBe(false);
  });
});

describe('salesForBatch', () => {
  it('lists sale lines of a batch newest first', () => {
    const d = demoData('2026-11-10');
    const lines = salesForBatch(d.sales, 'demo-b-s1');
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.every((l) => l.item.batchId === 'demo-b-s1')).toBe(true);
    for (let i = 1; i < lines.length; i++) expect(lines[i - 1]!.sale.date >= lines[i]!.sale.date).toBe(true);
  });
});
