import { saleTotal } from '../../domain/calc';
import { normalizeDescription } from '../../domain/importing';
import { monthKey } from '../../domain/dates';
import type { Cents, Client, Id, Product, Sale, SalePaymentInfo } from '../../domain/types';

export type SaleFilter = 'all' | 'open' | 'paid';

export interface SaleGroup {
  month: string; // YYYY-MM
  total: Cents;
  sales: Sale[];
}

/**
 * Filter by status (open = open or partly paid) and free text (client, product names, notes),
 * then group per month, newest month and newest sale first.
 */
export function groupSales(
  sales: Sale[],
  opts: {
    filter: SaleFilter;
    query: string;
    info: Map<Id, SalePaymentInfo>;
    clientById: Map<Id, Client>;
    productById: Map<Id, Product>;
    walkInLabel: string;
  },
): SaleGroup[] {
  const q = normalizeDescription(opts.query);
  const list = sales.filter((s) => {
    const st = opts.info.get(s.id)?.status ?? 'paid';
    if (opts.filter === 'open' && st === 'paid') return false;
    if (opts.filter === 'paid' && st !== 'paid') return false;
    if (!q) return true;
    const hay = [
      s.clientId ? (opts.clientById.get(s.clientId)?.name ?? '') : opts.walkInLabel,
      ...s.items.map((it) => opts.productById.get(it.productId)?.name ?? ''),
      s.notes ?? '',
    ]
      .map(normalizeDescription)
      .join(' ');
    return hay.includes(q);
  });
  const order = new Map(sales.map((s, i) => [s.id, i]));
  list.sort((a, b) => (a.date === b.date ? order.get(b.id)! - order.get(a.id)! : a.date < b.date ? 1 : -1));
  const groups: SaleGroup[] = [];
  for (const s of list) {
    const m = monthKey(s.date);
    let g = groups[groups.length - 1];
    if (!g || g.month !== m) groups.push((g = { month: m, total: 0, sales: [] }));
    g.sales.push(s);
    g.total += saleTotal(s);
  }
  return groups;
}
