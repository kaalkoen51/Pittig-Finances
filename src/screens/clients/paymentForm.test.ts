import { describe, expect, it } from 'vitest';
import type { Payment, Sale, SalePaymentInfo } from '../../domain/types';
import { buildPayment, clientHistory, paymentToForm, suggestedAmount, validatePaymentForm } from './paymentForm';
import { sortClients } from './clientList';

const info = (open: number): SalePaymentInfo => ({ saleId: 's', total: 1000, paid: 1000 - open, open, status: open ? 'open' : 'paid', overdue: false });

describe('payment form', () => {
  it('suggests sale open amount, else client balance', () => {
    const sales = new Map([['s1', info(400)], ['s2', info(0)]]);
    expect(suggestedAmount({ saleId: 's1', sales, outstanding: 900 })).toBe(400);
    expect(suggestedAmount({ saleId: 's2', sales, outstanding: 900 })).toBe(900);
    expect(suggestedAmount({ sales, outstanding: -50 })).toBeNull();
  });

  it('validates and builds payments (refund = negative)', () => {
    const f = { clientId: 'c1', amount: 1250, date: '2026-11-10', method: 'cash' as const, refund: false, notes: ' ' };
    expect(validatePaymentForm(f)).toEqual({});
    expect(validatePaymentForm({ ...f, clientId: undefined, amount: 0 })).toEqual({ clientId: 'required', amount: 'invalidAmount' });
    expect(buildPayment({ ...f, saleId: 's1' }, { id: 'p1' } as Payment)).toEqual({ id: 'p1', date: '2026-11-10', clientId: 'c1', saleId: 's1', amount: 1250, method: 'cash' });
    const refund = buildPayment({ ...f, refund: true, notes: 'retour' });
    expect(refund.amount).toBe(-1250);
    expect(refund.notes).toBe('retour');
    expect(paymentToForm(refund)).toMatchObject({ amount: 1250, refund: true });
  });
});

describe('clientHistory', () => {
  it('computes running balance oldest first and returns newest first', () => {
    const sales: Sale[] = [
      { id: 'a', date: '2026-10-01', clientId: 'c1', items: [{ productId: 'p', quantity: 10, unitPrice: 100 }] },
      { id: 'b', date: '2026-10-05', clientId: 'c1', items: [{ productId: 'p', quantity: 5, unitPrice: 100 }] },
      { id: 'x', date: '2026-10-02', clientId: 'c2', items: [{ productId: 'p', quantity: 1, unitPrice: 100 }] },
    ];
    const payments: Payment[] = [
      { id: 'p1', date: '2026-10-05', clientId: 'c1', amount: 1000 },
      { id: 'p2', date: '2026-10-07', clientId: 'c1', amount: -200 },
    ];
    const h = clientHistory({ sales, payments }, 'c1');
    expect(h.map((e) => [e.id, e.balance])).toEqual([
      ['p2', 700],
      ['p1', 500],
      ['b', 1500],
      ['a', 1000],
    ]);
  });
});

describe('sortClients', () => {
  it('sorts by open balance desc, then name', () => {
    const c = (id: string, name: string) => ({ id, name, archived: false });
    const sum = (outstanding: number) => ({ clientId: '', sold: 0, received: 0, outstanding, saleCount: 0, openSaleCount: 0 });
    const out = sortClients([c('1', 'Bert'), c('2', 'Anna'), c('3', 'Cees')], new Map([['3', sum(500)]]));
    expect(out.map((x) => x.name)).toEqual(['Cees', 'Anna', 'Bert']);
  });
});
