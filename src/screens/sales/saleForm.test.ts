import { describe, expect, it } from 'vitest';
import { demoData } from '../../domain/fixtures';
import type { Payment, Product, Sale } from '../../domain/types';
import { autoPaymentFor, buildSaleSave, canTogglePaid, emptySaleForm, formTotal, itemsSummary, lineForProduct, parseQuantity, saleToForm, validateSaleForm, hasErrors, type SaleFormState } from './saleForm';
import { groupSales } from './salesList';
import { allocatePayments } from '../../domain/calc';

const REF = '2026-11-10';
const data = demoData(REF);

const form = (patch: Partial<SaleFormState> = {}): SaleFormState => ({
  date: '2026-11-01',
  lines: [{ key: 'a', productId: 'p1', batchId: 'b1', quantity: '2', unitPrice: 650 }],
  paid: false,
  notes: '',
  ...patch,
});

describe('parseQuantity', () => {
  it('accepts comma decimals, rejects junk and zero', () => {
    expect(parseQuantity('3')).toBe(3);
    expect(parseQuantity('1,5')).toBe(1.5);
    expect(parseQuantity(' 2.25 ')).toBe(2.25);
    expect(parseQuantity('0')).toBeNull();
    expect(parseQuantity('abc')).toBeNull();
    expect(parseQuantity('')).toBeNull();
  });
});

describe('form defaults', () => {
  it('preselects the newest open batch and default price', () => {
    const l = lineForProduct(data, 'demo-p-sambal');
    expect(l.batchId).toBe('demo-b-s2'); // S-01 is closed
    expect(l.unitPrice).toBe(650);
    expect(l.quantity).toBe('1');
  });
  it('uses last used product and client (if not archived)', () => {
    const f = emptySaleForm(data, { today: REF, lastClientId: 'demo-c-toko', lastProductId: 'demo-p-habanero' });
    expect(f.date).toBe(REF);
    expect(f.clientId).toBe('demo-c-toko');
    expect(f.lines[0]!.productId).toBe('demo-p-habanero');
    expect(f.paid).toBe(false);
    const archived = { ...data, clients: data.clients.map((c) => ({ ...c, archived: true })) };
    expect(emptySaleForm(archived, { today: REF, lastClientId: 'demo-c-toko' }).clientId).toBeUndefined();
  });
});

describe('validation', () => {
  it('flags missing product, quantity and price per line', () => {
    const e = validateSaleForm(form({ lines: [{ key: 'x', quantity: '', unitPrice: null }] }));
    expect(hasErrors(e)).toBe(true);
    expect(e.line?.x).toEqual({ productId: 'required', quantity: 'required', unitPrice: 'required' });
    expect(hasErrors(validateSaleForm(form()))).toBe(false);
  });
});

describe('buildSaleSave', () => {
  it('walk-in sale: no client, no payment, no due date', () => {
    const plan = buildSaleSave(form({ paid: true, dueDate: '2026-12-01' }), { id: 's1' });
    expect(plan.sale).toEqual({ id: 's1', date: '2026-11-01', items: [{ productId: 'p1', batchId: 'b1', quantity: 2, unitPrice: 650 }] });
    expect(plan.upsertPayments).toEqual([]);
  });

  it('paid already with client creates a full payment on the sale date', () => {
    const f = form({ clientId: 'c1', paid: true, lines: [form().lines[0]!, { key: 'b', productId: 'p2', quantity: '1,5', unitPrice: 1000 }] });
    expect(formTotal(f)).toBe(2800);
    const plan = buildSaleSave(f, { id: 's1' });
    expect(plan.sale.clientId).toBe('c1');
    expect(plan.upsertPayments).toHaveLength(1);
    expect(plan.upsertPayments[0]).toMatchObject({ clientId: 'c1', saleId: 's1', amount: 2800, date: '2026-11-01' });
  });

  it('unpaid with client keeps due date and notes trimmed', () => {
    const plan = buildSaleSave(form({ clientId: 'c1', dueDate: '2026-11-15', notes: '  op factuur ' }), { id: 's1' });
    expect(plan.sale.dueDate).toBe('2026-11-15');
    expect(plan.sale.notes).toBe('op factuur');
    expect(plan.upsertPayments).toEqual([]);
  });

  it('editing: toggle controls the auto payment (update amount, or remove)', () => {
    const sale: Sale = { id: 's1', date: '2026-11-01', clientId: 'c1', items: [{ productId: 'p1', quantity: 2, unitPrice: 650 }] };
    const auto: Payment = { id: 'pay1', date: '2026-11-01', clientId: 'c1', saleId: 's1', amount: 1300, method: 'cash', auto: true };
    expect(autoPaymentFor(sale, [auto])).toBe(auto);
    const f = saleToForm(sale, [auto]);
    expect(f.paid).toBe(true);
    expect(f.lines[0]!.quantity).toBe('2');

    const more = buildSaleSave({ ...f, lines: [{ ...f.lines[0]!, quantity: '3' }] }, { existing: sale, linked: [auto] });
    expect(more.upsertPayments).toEqual([{ id: 'pay1', date: '2026-11-01', clientId: 'c1', saleId: 's1', amount: 1950, method: 'cash', auto: true }]);

    const off = buildSaleSave({ ...f, paid: false }, { existing: sale, linked: [auto] });
    expect(off.removePaymentIds).toEqual(['pay1']);
    expect(off.upsertPayments).toEqual([]);
  });

  it('editing never rewrites or deletes a real payment that equals the total (review #2)', () => {
    const sale: Sale = { id: 's1', date: '2026-03-01', clientId: 'c', items: [{ productId: 'p', quantity: 10, unitPrice: 500 }] };
    const bank: Payment = { id: 'pay', date: '2026-03-20', clientId: 'c', saleId: 's1', amount: 5000, method: 'bank', notes: 'from bank' };
    expect(autoPaymentFor(sale, [bank])).toBeUndefined();
    expect(canTogglePaid(sale, [bank])).toBe(false);
    const f = saleToForm(sale, [bank]);
    expect(f.paid).toBe(false);
    const plan = buildSaleSave({ ...f, lines: [{ ...f.lines[0]!, quantity: '12' }] }, { existing: sale, linked: [bank] });
    expect(plan.upsertPayments).toEqual([]);
    expect(plan.removePaymentIds).toEqual([]);
    // Even with the toggle forced on, the bank payment stays as it is (a separate auto payment is added).
    const forced = buildSaleSave({ ...f, paid: true }, { existing: sale, linked: [bank] });
    expect(forced.removePaymentIds).toEqual([]);
    expect(forced.upsertPayments.every((p) => p.id !== 'pay' && p.auto === true)).toBe(true);
  });

  it('new "paid already" payments are marked auto; legacy unmarked toggle payments are still recognised', () => {
    const plan = buildSaleSave(form({ clientId: 'c1', paid: true }), { id: 's1' });
    expect(plan.upsertPayments[0]!.auto).toBe(true);
    const sale: Sale = { id: 's1', date: '2026-11-01', clientId: 'c1', items: [{ productId: 'p1', quantity: 2, unitPrice: 650 }] };
    const legacy: Payment = { id: 'old', date: '2026-11-01', clientId: 'c1', saleId: 's1', amount: 1300 };
    expect(autoPaymentFor(sale, [legacy])).toBe(legacy);
    expect(autoPaymentFor(sale, [{ ...legacy, method: 'bank' }])).toBeUndefined();
    expect(autoPaymentFor(sale, [{ ...legacy, date: '2026-11-05' }])).toBeUndefined();
  });

  it('editing with partial payments: no toggle; payments follow a client change', () => {
    const sale: Sale = { id: 's1', date: '2026-11-01', clientId: 'c1', items: [{ productId: 'p1', quantity: 2, unitPrice: 650 }] };
    const part: Payment = { id: 'pay1', date: '2026-11-03', clientId: 'c1', saleId: 's1', amount: 500 };
    expect(canTogglePaid(sale, [part])).toBe(false);
    expect(canTogglePaid(sale, [])).toBe(true);
    expect(canTogglePaid(sale, [], 300)).toBe(false); // partly paid via FIFO pool
    const f = saleToForm(sale, [part]);
    expect(f.paid).toBe(false);
    const moved = buildSaleSave({ ...f, clientId: 'c2' }, { existing: sale, linked: [part] });
    expect(moved.upsertPayments).toEqual([{ ...part, clientId: 'c2' }]);
    const walkIn = buildSaleSave({ ...f, clientId: undefined }, { existing: sale, linked: [part] });
    expect(walkIn.upsertPayments).toEqual([{ id: 'pay1', date: '2026-11-03', clientId: 'c1', amount: 500 }]);
  });

  it('gives inline-created products (price 0) the used price as default', () => {
    const products: Product[] = [{ id: 'p1', name: 'Nieuw', unit: 'stuk', defaultPrice: 0, archived: false }];
    const plan = buildSaleSave(form(), { products });
    expect(plan.productPriceUpdates).toEqual([{ ...products[0], defaultPrice: 650 }]);
  });
});

describe('list helpers', () => {
  it('summarises items', () => {
    const s = data.sales.find((x) => x.id === 'demo-sale-3')!;
    expect(itemsSummary(s, (id) => data.products.find((p) => p.id === id)!.name)).toBe('30× Sambal Pittig, 12× Habanero Hot Sauce');
  });

  it('groups per month newest first, filters status and search', () => {
    const info = allocatePayments(data, REF);
    const base = {
      info,
      clientById: new Map(data.clients.map((c) => [c.id, c])),
      productById: new Map(data.products.map((p) => [p.id, p])),
      walkInLabel: 'Losse verkoop',
    };
    const all = groupSales(data.sales, { ...base, filter: 'all', query: '' });
    const flat = all.flatMap((g) => g.sales);
    expect(flat).toHaveLength(data.sales.length);
    for (let i = 1; i < flat.length; i++) expect(flat[i - 1]!.date >= flat[i]!.date).toBe(true);
    expect(all.map((g) => g.month)).toEqual([...new Set(all.map((g) => g.month))]);

    const open = groupSales(data.sales, { ...base, filter: 'open', query: '' }).flatMap((g) => g.sales);
    expect(open.length).toBeGreaterThan(0);
    expect(open.every((s) => info.get(s.id)!.status !== 'paid')).toBe(true);

    const toko = groupSales(data.sales, { ...base, filter: 'all', query: 'toko' }).flatMap((g) => g.sales);
    expect(toko.every((s) => s.clientId === 'demo-c-toko')).toBe(true);
    const walk = groupSales(data.sales, { ...base, filter: 'all', query: 'losse' }).flatMap((g) => g.sales);
    expect(walk.length).toBeGreaterThan(0);
    expect(walk.every((s) => !s.clientId)).toBe(true);
  });
});
