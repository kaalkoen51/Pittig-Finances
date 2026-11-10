import { describe, expect, it } from 'vitest';
import {
  allocatePayments,
  batchStats,
  clientSummaries,
  generalCosts,
  hasUserContent,
  isReferenced,
  monthlySummaries,
  newestOpenBatch,
  openSalesForClient,
  periodSummary,
  productStats,
  saleTotal,
  supplierOwed,
  totalOwedToYou,
  totalYouOwe,
} from './calc';
import { periodRange } from './dates';
import { demoData } from './fixtures';
import { emptyData } from './migrate';
import type { AppData, Payment, Sale } from './types';

const REF = '2026-03-31';

function base(): AppData {
  const d = emptyData();
  d.clients = [
    { id: 'c1', name: 'A', archived: false },
    { id: 'c2', name: 'B', archived: false },
  ];
  d.products = [{ id: 'p1', name: 'Sambal', unit: 'pot', defaultPrice: 500, archived: false }];
  return d;
}
const sale = (id: string, date: string, total: number, clientId?: string, extra: Partial<Sale> = {}): Sale => ({
  id,
  date,
  ...(clientId ? { clientId } : {}),
  items: [{ productId: 'p1', quantity: 1, unitPrice: total }],
  ...extra,
});
const pay = (id: string, date: string, amount: number, clientId: string, saleId?: string): Payment => ({
  id,
  date,
  amount,
  clientId,
  ...(saleId ? { saleId } : {}),
});

describe('saleTotal', () => {
  it('sums lines with rounding', () => {
    expect(
      saleTotal({
        id: 's',
        date: REF,
        items: [
          { productId: 'p', quantity: 3, unitPrice: 650 },
          { productId: 'p', quantity: 0.5, unitPrice: 333 },
        ],
      }),
    ).toBe(1950 + 167);
  });
});

describe('allocatePayments (FIFO)', () => {
  it('applies untargeted payments oldest-first', () => {
    const d = base();
    d.sales = [sale('s2', '2026-02-10', 1000, 'c1'), sale('s1', '2026-01-10', 1000, 'c1'), sale('s3', '2026-03-10', 1000, 'c1')];
    d.payments = [pay('p1', '2026-03-20', 1500, 'c1')];
    const a = allocatePayments(d, REF);
    expect(a.get('s1')).toMatchObject({ paid: 1000, open: 0, status: 'paid' });
    expect(a.get('s2')).toMatchObject({ paid: 500, open: 500, status: 'partial' });
    expect(a.get('s3')).toMatchObject({ paid: 0, open: 1000, status: 'open' });
  });

  it('applies targeted payments to their sale first, excess into the pool', () => {
    const d = base();
    d.sales = [sale('s1', '2026-01-10', 1000, 'c1'), sale('s2', '2026-02-10', 1000, 'c1')];
    d.payments = [pay('p1', '2026-03-01', 1300, 'c1', 's2')];
    const a = allocatePayments(d, REF);
    expect(a.get('s2')).toMatchObject({ paid: 1000, status: 'paid' });
    expect(a.get('s1')).toMatchObject({ paid: 300, status: 'partial' });
  });

  it('does not let one client pay for another', () => {
    const d = base();
    d.sales = [sale('s1', '2026-01-10', 1000, 'c1'), sale('s2', '2026-01-10', 1000, 'c2')];
    d.payments = [pay('p1', '2026-03-01', 5000, 'c2'), pay('p2', '2026-03-01', 1000, 'c2', 's1')];
    const a = allocatePayments(d, REF);
    expect(a.get('s1')!.status).toBe('open');
    expect(a.get('s2')!.status).toBe('paid');
  });

  it('treats clientless sales as paid', () => {
    const d = base();
    d.sales = [sale('s1', '2026-01-10', 1000)];
    expect(allocatePayments(d, REF).get('s1')).toMatchObject({ paid: 1000, open: 0, status: 'paid', overdue: false });
  });

  it('handles refunds (negative payments) by reducing what was received', () => {
    const d = base();
    d.sales = [sale('s1', '2026-01-10', 1000, 'c1')];
    d.payments = [pay('p1', '2026-02-01', 1000, 'c1'), pay('p2', '2026-02-05', -400, 'c1')];
    expect(allocatePayments(d, REF).get('s1')).toMatchObject({ paid: 600, open: 400, status: 'partial' });
    expect(clientSummaries(d, REF).get('c1')).toMatchObject({ sold: 1000, received: 600, outstanding: 400 });
  });

  it('flags overdue open sales', () => {
    const d = base();
    d.sales = [sale('s1', '2026-01-10', 1000, 'c1', { dueDate: '2026-03-01' }), sale('s2', '2026-01-10', 1000, 'c1', { dueDate: '2026-04-30' })];
    const a = allocatePayments(d, REF);
    expect(a.get('s1')!.overdue).toBe(true);
    expect(a.get('s2')!.overdue).toBe(false);
  });

  it('ignores a saleId pointing to a missing sale (goes into the pool)', () => {
    const d = base();
    d.sales = [sale('s1', '2026-01-10', 1000, 'c1')];
    d.payments = [pay('p1', '2026-02-01', 1000, 'c1', 'gone')];
    expect(allocatePayments(d, REF).get('s1')!.status).toBe('paid');
  });
});

describe('clients', () => {
  it('computes balances and credit', () => {
    const d = base();
    d.sales = [sale('s1', '2026-01-10', 1000, 'c1')];
    d.payments = [pay('p1', '2026-02-01', 1500, 'c1')];
    const s = clientSummaries(d, REF);
    expect(s.get('c1')).toMatchObject({ sold: 1000, received: 1500, outstanding: -500, openSaleCount: 0, lastActivity: '2026-02-01' });
    expect(s.get('c2')).toMatchObject({ sold: 0, received: 0, outstanding: 0 });
    expect(totalOwedToYou(d, REF)).toBe(0);
  });
});

describe('demo data', () => {
  const d = demoData(REF);

  it('sale statuses', () => {
    const a = allocatePayments(d, REF);
    expect(a.get('demo-sale-1')!.status).toBe('paid');
    expect(a.get('demo-sale-2')!.status).toBe('paid');
    expect(a.get('demo-sale-3')).toMatchObject({ total: 24900, paid: 10000, open: 14900, status: 'partial', overdue: true });
    expect(a.get('demo-sale-4')).toMatchObject({ total: 7500, status: 'open', overdue: true });
    expect(a.get('demo-sale-5')).toMatchObject({ total: 13200, status: 'open', overdue: false });
    expect(a.get('demo-sale-6')!.status).toBe('paid');
  });

  it('client totals and debtors', () => {
    const s = clientSummaries(d, REF);
    expect(s.get('demo-c-toko')).toMatchObject({ sold: 24900, received: 10000, outstanding: 14900, openSaleCount: 1 });
    expect(s.get('demo-c-smaak')).toMatchObject({ sold: 52500, received: 52500, outstanding: 0 });
    expect(totalOwedToYou(d, REF)).toBe(14900 + 7500 + 13200);
    expect(openSalesForClient(d, 'demo-c-toko', REF).map((x) => x.sale.id)).toEqual(['demo-sale-3']);
  });

  it('batch stats incl. cost per unit and units left', () => {
    const b = batchStats(d);
    expect(b.get('demo-b-s1')).toMatchObject({
      quantity: 120,
      unitsSold: 95,
      unitsLeft: 25,
      revenue: 22000 + 16250 + 16500,
      costs: 24100,
      profit: 54750 - 24100,
      costPerUnit: Math.round(24100 / 120),
    });
    expect(b.get('demo-b-s2')).toMatchObject({ unitsSold: 54, unitsLeft: 96, costs: 29800, costPerUnit: Math.round(29800 / 150) });
    expect(b.get('demo-b-h1')).toMatchObject({ unitsSold: 50, unitsLeft: 30, revenue: 8400 + 7500 + 14000 + 6360, costs: 17650 });
  });

  it('cost per unit is null for zero quantity', () => {
    const x = demoData(REF);
    x.batches[0]!.quantity = 0;
    expect(batchStats(x).get('demo-b-s1')!.costPerUnit).toBeNull();
  });

  it('product stats', () => {
    const p = productStats(d);
    expect(p.get('demo-p-sambal')).toMatchObject({ unitsSold: 149, batchCount: 2, costs: 24100 + 29800 });
  });

  it('general costs are expenses without batch', () => {
    expect(generalCosts(d)).toBe(8950 + 3500 + 3500 + 4280);
    expect(generalCosts(d, periodRange('thisMonth', REF))).toBe(8950 + 3500 + 4280);
  });

  it('supplier owed with overdue flag', () => {
    const owed = supplierOwed(d, REF);
    expect(owed.map((o) => o.supplierId)).toEqual(['demo-s-jars', 'demo-s-print']);
    expect(owed[0]).toMatchObject({ total: 12000, overdue: true, overdueTotal: 12000 });
    expect(owed[1]).toMatchObject({ total: 8950, overdue: false, overdueTotal: 0 });
    expect(totalYouOwe(d)).toBe(20950);
  });

  it('newest open batch', () => {
    expect(newestOpenBatch(d, 'demo-p-sambal')!.id).toBe('demo-b-s2');
    expect(newestOpenBatch(d, 'demo-p-habanero')!.id).toBe('demo-b-h1');
    expect(newestOpenBatch(d, 'nope')).toBeUndefined();
  });

  it('period summary this month (cash and booked)', () => {
    const s = periodSummary(d, periodRange('thisMonth', REF));
    // payments this month: pay-3 (30500, day 28); pay-2 is day 17 → also March
    // walk-in sale-7 (8*795=6360) day 30
    expect(s.moneyIn).toBe(30500 + 10000 + 6360);
    // expenses paid in March: e-9 (3500, d1), e-10 (4280, d10), e-5 (17800, d22 = 03-09)
    expect(s.moneyOut).toBe(3500 + 4280 + 17800);
    expect(s.result).toBe(s.moneyIn - s.moneyOut);
    // sales dated in March: sale-3 (03-01), sale-4, sale-5, sale-6, sale-7
    expect(s.sold).toBe(24900 + 7500 + 13200 + 30500 + 6360);
    expect(s.saleCount).toBe(5);
  });

  it('all-time totals are consistent', () => {
    const s = periodSummary(d, {});
    const received = d.payments.reduce((t, p) => t + p.amount, 0);
    const walkIn = d.sales.filter((x) => !x.clientId).reduce((t, x) => t + saleTotal(x), 0);
    expect(s.moneyIn).toBe(received + walkIn);
    expect(s.costs).toBe(d.expenses.reduce((t, e) => t + e.amount, 0));
    expect(s.moneyOut).toBe(s.costs - totalYouOwe(d));
    const months = monthlySummaries(d);
    expect(months[0]!.month).toBe('2026-03');
    expect(months.reduce((t, m) => t + m.summary.sold, 0)).toBe(s.sold);
  });

  it('references', () => {
    expect(isReferenced(d, 'clients', 'demo-c-toko')).toBe(true);
    expect(isReferenced(d, 'suppliers', 'demo-s-spice')).toBe(true);
    expect(isReferenced(d, 'products', 'demo-p-sambal')).toBe(true);
    expect(isReferenced(d, 'batches', 'demo-b-s1')).toBe(true);
    expect(isReferenced(d, 'categories', 'demo-cat-ingr')).toBe(true);
    expect(isReferenced(d, 'categories', 'demo-cat-mkt')).toBe(false);
    expect(isReferenced(d, 'sales', 'demo-sale-1')).toBe(true);
    expect(isReferenced(d, 'sales', 'demo-sale-4')).toBe(false);
    expect(isReferenced(d, 'payments', 'demo-pay-1')).toBe(false);
  });

  it('user content detection', () => {
    expect(hasUserContent(d)).toBe(true);
    expect(hasUserContent(emptyData())).toBe(false);
  });
});
