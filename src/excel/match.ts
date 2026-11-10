/**
 * Helpers for sorting import rows by hand. No automatic classification: these only produce
 * suggestions the user confirms with one click.
 */
import { addDays, daysBetween } from '../domain/dates';
import { newId } from '../domain/ids';
import { normalizeDescription } from '../domain/importing';
import type { AppData, Expense, Id, ImportRow, Payment } from '../domain/types';

export type Suggestion = { collection: 'payments'; item: Payment; days: number } | { collection: 'expenses'; item: Expense; days: number };

/**
 * Existing payments (money in) or expenses (money out) that could be this bank row:
 * same absolute amount, date within ±7 days, and not already linked to another import row.
 * Closest date first.
 */
export function matchSuggestions(data: AppData, row: ImportRow, windowDays = 7): Suggestion[] {
  const linked = new Set(data.importRows.filter((r) => r.id !== row.id && r.linkedId).map((r) => r.linkedId));
  const abs = Math.abs(row.amount);
  const from = addDays(row.date, -windowDays);
  const to = addDays(row.date, windowDays);
  const near = (d: string) => d >= from && d <= to;
  const out: Suggestion[] = [];
  if (row.amount >= 0) {
    for (const p of data.payments) {
      if (Math.abs(p.amount) === abs && near(p.date) && !linked.has(p.id)) out.push({ collection: 'payments', item: p, days: Math.abs(daysBetween(row.date, p.date)) });
    }
  } else {
    for (const e of data.expenses) {
      const d = e.paidOn ?? e.date;
      if (Math.abs(e.amount) === abs && (near(d) || near(e.date)) && !linked.has(e.id)) {
        out.push({ collection: 'expenses', item: e, days: Math.min(Math.abs(daysBetween(row.date, d)), Math.abs(daysBetween(row.date, e.date))) });
      }
    }
  }
  return out.sort((a, b) => a.days - b.days);
}

/** Id of the client/supplier whose name exactly equals the bank counterparty (case/accents-insensitive). */
export function exactNameMatch<T extends { id: Id; name: string; archived: boolean }>(list: readonly T[], counterparty: string | undefined): Id | undefined {
  if (!counterparty) return undefined;
  const n = normalizeDescription(counterparty);
  if (!n) return undefined;
  return list.find((x) => !x.archived && normalizeDescription(x.name) === n)?.id;
}

/** Payment created from a bank row (refund to client when the row is negative). */
export function paymentFromRow(row: ImportRow, clientId: Id, saleId?: Id): Payment {
  const p: Payment = { id: newId(), date: row.date, clientId, amount: row.amount, method: 'bank' };
  if (saleId) p.saleId = saleId;
  const notes = row.description && row.description !== row.counterparty ? row.description : '';
  if (notes) p.notes = notes;
  return p;
}

/** Expense created from a bank row: paid on the bank date. Positive bank rows become refunds. */
export function expenseFromRow(row: ImportRow, f: { categoryId: Id; supplierId?: Id; batchId?: Id; description?: string }): Expense {
  const e: Expense = {
    id: newId(),
    date: row.date,
    categoryId: f.categoryId,
    description: (f.description ?? row.description ?? row.counterparty ?? '').trim() || row.counterparty || '',
    amount: -row.amount,
    paidOn: row.date,
  };
  if (f.supplierId) e.supplierId = f.supplierId;
  if (f.batchId) e.batchId = f.batchId;
  return e;
}

/** Row after it was linked (status 'done'). `created`: the linked record was made from this row. */
export function linkRow(row: ImportRow, collection: 'payments' | 'expenses' | 'sales', linkedId: Id, created = false): ImportRow {
  const { linkCreated: _lc, ...rest } = row;
  return { ...rest, status: 'done', linkedId, linkedCollection: collection, ...(created ? { linkCreated: true } : {}) };
}

/** Matching a bank row (money out) to an unpaid expense means it was paid on the bank date. */
export function markExpensePaidByRow(e: Expense, row: ImportRow): Expense {
  return e.paidOn === null ? { ...e, paidOn: row.date } : e;
}

/** Back to 'todo' without link. */
export function reopenRow(row: ImportRow): ImportRow {
  const { linkedId: _l, linkedCollection: _c, linkCreated: _lc, ...rest } = row;
  return { ...rest, status: 'todo' };
}
