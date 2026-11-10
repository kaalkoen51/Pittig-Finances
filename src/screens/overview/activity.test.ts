import { describe, expect, it } from 'vitest';
import type { Expense, Payment, Sale } from '../../domain/types';
import { buildActivity, costSplit } from './activity';

const sale = (id: string, date: string, clientId?: string): Sale => ({ id, date, ...(clientId ? { clientId } : {}), items: [{ productId: 'p', quantity: 1, unitPrice: 1000 }] });
const exp = (id: string, date: string, batchId?: string): Expense => ({ id, date, categoryId: 'c', description: id, amount: 300, paidOn: date, ...(batchId ? { batchId } : {}) });

describe('buildActivity', () => {
  it('mixes kinds newest first, later-entered first on the same date, and limits', () => {
    const sales = [sale('s1', '2026-11-01'), sale('s2', '2026-11-05', 'c1')];
    const payments: Payment[] = [{ id: 'p1', date: '2026-11-06', clientId: 'c1', amount: 400 }];
    const expenses = [exp('e1', '2026-11-05'), exp('e2', '2026-10-20')];
    const a = buildActivity({ sales, payments, expenses });
    expect(a.map((x) => x.id)).toEqual(['p1', 'e1', 's2', 's1', 'e2']);
    expect(buildActivity({ sales, payments, expenses }, 2)).toHaveLength(2);
  });

  it('folds the "paid already" payment into its sale', () => {
    const sales = [sale('s1', '2026-11-01', 'c1')];
    const payments: Payment[] = [
      { id: 'auto', date: '2026-11-01', clientId: 'c1', saleId: 's1', amount: 1000 },
      { id: 'later', date: '2026-11-03', clientId: 'c1', saleId: 's1', amount: 1000 },
    ];
    expect(buildActivity({ sales, payments, expenses: [] }).map((x) => x.id)).toEqual(['later', 's1']);
  });
});

describe('costSplit', () => {
  it('splits booked costs in range into batch and general', () => {
    const expenses = [exp('a', '2026-11-02', 'b1'), exp('b', '2026-11-03'), exp('c', '2026-10-03')];
    expect(costSplit({ expenses }, { from: '2026-11-01', to: '2026-11-30' })).toEqual({ batch: 300, general: 300 });
  });
});
