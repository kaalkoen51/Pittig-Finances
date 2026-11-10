/** Recent activity feed for the Overview: sales, payments and expenses mixed, newest first. */
import { saleTotal } from '../../domain/calc';
import { inRange } from '../../domain/dates';
import type { AppData, Cents, DateRange, Expense, ISODate, Payment, Sale } from '../../domain/types';

export type ActivityItem =
  | { kind: 'sale'; id: string; date: ISODate; amount: Cents; sale: Sale }
  | { kind: 'payment'; id: string; date: ISODate; amount: Cents; payment: Payment }
  | { kind: 'expense'; id: string; date: ISODate; amount: Cents; expense: Expense };

/**
 * Newest first. Same date: later-entered first (array order). A payment created by "Paid already"
 * (linked to a sale, same date, full amount) is folded into its sale and not listed separately.
 */
export function buildActivity(data: Pick<AppData, 'sales' | 'payments' | 'expenses'>, limit = 8): ActivityItem[] {
  const saleById = new Map(data.sales.map((s) => [s.id, s]));
  const items: (ActivityItem & { seq: number })[] = [];
  let seq = 0;
  for (const s of data.sales) items.push({ kind: 'sale', id: s.id, date: s.date, amount: saleTotal(s), sale: s, seq: seq++ });
  for (const p of data.payments) {
    const s = p.saleId ? saleById.get(p.saleId) : undefined;
    if (s && s.date === p.date && s.clientId === p.clientId && saleTotal(s) === p.amount) continue;
    items.push({ kind: 'payment', id: p.id, date: p.date, amount: p.amount, payment: p, seq: seq++ });
  }
  for (const e of data.expenses) items.push({ kind: 'expense', id: e.id, date: e.date, amount: e.amount, expense: e, seq: seq++ });
  items.sort((a, b) => (a.date !== b.date ? (a.date < b.date ? 1 : -1) : b.seq - a.seq));
  return items.slice(0, limit).map(({ seq: _s, ...rest }) => rest as ActivityItem);
}

/** Booked costs in a range (by expense date), split into batch costs and general costs. */
export function costSplit(data: Pick<AppData, 'expenses'>, range: DateRange): { batch: Cents; general: Cents } {
  let batch = 0;
  let general = 0;
  for (const e of data.expenses) {
    if (!inRange(e.date, range)) continue;
    if (e.batchId) batch += e.amount;
    else general += e.amount;
  }
  return { batch, general };
}
