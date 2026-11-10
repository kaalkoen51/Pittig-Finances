/**
 * Helpers for sorting import rows by hand. No automatic classification: these only produce
 * suggestions the user confirms with one click.
 */
import { addDays, daysBetween } from '../domain/dates';
import { newId } from '../domain/ids';
import { normalizeDescription } from '../domain/importing';
import type { AppData, Expense, Id, ImportRow, Payment } from '../domain/types';

export type Suggestion =
  | { collection: 'payments'; item: Payment; days: number; nameMatch?: boolean }
  /** `unpaid`: an open bill – matching it marks it paid on the bank date. */
  | { collection: 'expenses'; item: Expense; days: number; nameMatch?: boolean; unpaid?: boolean };

/** How long before the bank date an unpaid bill may be dated to still be suggested. */
export const UNPAID_BILL_WINDOW_DAYS = 120;

/**
 * Existing payments (money in) or expenses (money out) that could be this bank row and are not
 * already linked to another import row:
 * - booked payments / paid expenses: same absolute amount, date within ±7 days;
 * - unpaid bills (money out only): same amount, dated up to 120 days before the bank date
 *   (a bill is usually paid weeks after its date).
 * Order: counterparty name matches the supplier/client first, then closest date.
 */
export function matchSuggestions(data: AppData, row: ImportRow, windowDays = 7): Suggestion[] {
  const linked = new Set(data.importRows.filter((r) => r.id !== row.id && r.linkedId).map((r) => r.linkedId));
  const abs = Math.abs(row.amount);
  const from = addDays(row.date, -windowDays);
  const to = addDays(row.date, windowDays);
  const near = (d: string) => d >= from && d <= to;
  const billFrom = addDays(row.date, -UNPAID_BILL_WINDOW_DAYS);
  const out: Suggestion[] = [];
  if (row.amount >= 0) {
    const clientName = new Map(data.clients.map((c) => [c.id, c.name]));
    for (const p of data.payments) {
      if (Math.abs(p.amount) === abs && near(p.date) && !linked.has(p.id)) {
        out.push({ collection: 'payments', item: p, days: Math.abs(daysBetween(row.date, p.date)), ...(namesAlike(clientName.get(p.clientId), row.counterparty) ? { nameMatch: true } : {}) });
      }
    }
  } else {
    const supplierName = new Map(data.suppliers.map((s) => [s.id, s.name]));
    for (const e of data.expenses) {
      if (Math.abs(e.amount) !== abs || linked.has(e.id)) continue;
      const d = e.paidOn ?? e.date;
      const unpaid = e.paidOn === null && e.amount > 0;
      const inWindow = near(d) || near(e.date) || (unpaid && e.date >= billFrom && e.date <= to);
      if (!inWindow) continue;
      const nameMatch = namesAlike(e.supplierId ? supplierName.get(e.supplierId) : undefined, row.counterparty);
      out.push({
        collection: 'expenses',
        item: e,
        days: Math.min(Math.abs(daysBetween(row.date, d)), Math.abs(daysBetween(row.date, e.date))),
        ...(nameMatch ? { nameMatch: true } : {}),
        ...(unpaid ? { unpaid: true } : {}),
      });
    }
  }
  const rank = (s: Suggestion) => (s.nameMatch ? 0 : 1);
  return out.sort((a, b) => rank(a) - rank(b) || a.days - b.days);
}

/** Name for comparing: normalized, punctuation dropped, legal forms (BV, VOF, NV…) removed. */
export function nameKey(name: string | undefined): string {
  if (!name) return '';
  return normalizeDescription(name)
    .replace(/\b(b\.?v\.?|n\.?v\.?|v\.?o\.?f\.?|c\.?v\.?|holding|eenmanszaak|ltd|gmbh|inc)\b\.?/g, ' ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** "Verpakking Direct BV" ≈ "Verpakking Direct"; "Toko Sari Utrecht" ≈ "Toko Sari". */
export function namesAlike(a: string | undefined, b: string | undefined): boolean {
  const x = nameKey(a);
  const y = nameKey(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return short.length >= 4 && ` ${long} `.includes(` ${short} `);
}

/**
 * Client/supplier that is probably the bank counterparty: exact name first, otherwise the only
 * one whose name is alike (ignoring "BV", punctuation, extra words). Just a prefill the user sees.
 */
export function fuzzyNameMatch<T extends { id: Id; name: string; archived: boolean }>(list: readonly T[], counterparty: string | undefined): Id | undefined {
  const exact = exactNameMatch(list, counterparty);
  if (exact) return exact;
  const alike = list.filter((x) => !x.archived && namesAlike(x.name, counterparty));
  return alike.length === 1 ? alike[0]!.id : undefined;
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
