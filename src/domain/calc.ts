/**
 * Pure derived numbers. Everything in cents. No React, no I/O.
 * See docs/CONTRACTS.md for the money semantics.
 */
import { compareDates, inRange, monthKey, today as todayFn } from './dates';
import type {
  AppData,
  Batch,
  BatchStats,
  Cents,
  ClientSummary,
  CollectionName,
  DateRange,
  Expense,
  Id,
  Payment,
  PeriodSummary,
  ProductStats,
  Sale,
  SaleItem,
  SalePaymentInfo,
  SupplierOwed,
} from './types';

// ---------- Sales ----------

export function lineTotal(item: SaleItem): Cents {
  return Math.round(item.quantity * item.unitPrice);
}

export function saleTotal(sale: Sale): Cents {
  let t = 0;
  for (const it of sale.items) t += lineTotal(it);
  return t;
}

const bySaleOrder = (a: Sale, b: Sale) => compareDates(a.date, b.date) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * Per-sale payment status for every sale.
 *
 * Rules (plan revisions):
 * - Clientless sales are always fully paid.
 * - Per client: payments with a `saleId` of that client's sale apply to that sale first
 *   (clamped to 0..total; any excess/negative remainder goes to the client's pool).
 * - All other payments of the client form a pool that is applied FIFO to the client's
 *   sales, oldest first (by date, then id).
 * - status: paid (open = 0), partial (0 < paid < total), open (paid = 0).
 * - Sales with total <= 0 count as paid.
 */
export function allocatePayments(data: Pick<AppData, 'sales' | 'payments'>, today: string = todayFn()): Map<Id, SalePaymentInfo> {
  const result = new Map<Id, SalePaymentInfo>();
  const salesByClient = new Map<Id, Sale[]>();
  const saleById = new Map<Id, Sale>();
  for (const s of data.sales) {
    saleById.set(s.id, s);
    if (!s.clientId) continue;
    let list = salesByClient.get(s.clientId);
    if (!list) salesByClient.set(s.clientId, (list = []));
    list.push(s);
  }
  const targeted = new Map<Id, Cents>();
  const pool = new Map<Id, Cents>();
  for (const p of data.payments) {
    const target = p.saleId ? saleById.get(p.saleId) : undefined;
    if (target && target.clientId === p.clientId) {
      targeted.set(target.id, (targeted.get(target.id) ?? 0) + p.amount);
    } else {
      pool.set(p.clientId, (pool.get(p.clientId) ?? 0) + p.amount);
    }
  }

  const make = (s: Sale, total: Cents, paid: Cents): SalePaymentInfo => {
    const open = Math.max(0, total - paid);
    const status = open === 0 ? 'paid' : paid > 0 ? 'partial' : 'open';
    return {
      saleId: s.id,
      total,
      paid,
      open,
      status,
      overdue: open > 0 && !!s.dueDate && s.dueDate < today,
    };
  };

  for (const s of data.sales) {
    if (!s.clientId) {
      const total = saleTotal(s);
      result.set(s.id, make(s, total, total));
    }
  }

  for (const [clientId, sales] of salesByClient) {
    sales.sort(bySaleOrder);
    let rest = pool.get(clientId) ?? 0;
    const paidMap = new Map<Id, Cents>();
    for (const s of sales) {
      const total = saleTotal(s);
      if (total <= 0) {
        paidMap.set(s.id, total);
        rest += targeted.get(s.id) ?? 0;
        continue;
      }
      const t = targeted.get(s.id) ?? 0;
      const applied = Math.min(Math.max(t, 0), total);
      rest += t - applied;
      paidMap.set(s.id, applied);
    }
    for (const s of sales) {
      const total = saleTotal(s);
      let paid = paidMap.get(s.id) ?? 0;
      if (total > 0 && rest > 0 && paid < total) {
        const add = Math.min(rest, total - paid);
        paid += add;
        rest -= add;
      }
      result.set(s.id, make(s, total, paid));
    }
  }
  return result;
}

// ---------- Clients ----------

/** Totals per client id (every client in data.clients gets an entry, plus any id referenced by sales/payments). */
export function clientSummaries(data: AppData, today: string = todayFn(), alloc = allocatePayments(data, today)): Map<Id, ClientSummary> {
  const out = new Map<Id, ClientSummary>();
  const get = (id: Id) => {
    let s = out.get(id);
    if (!s) {
      s = { clientId: id, sold: 0, received: 0, outstanding: 0, saleCount: 0, openSaleCount: 0 };
      out.set(id, s);
    }
    return s;
  };
  for (const c of data.clients) get(c.id);
  const touch = (s: ClientSummary, d: string) => {
    if (!s.lastActivity || d > s.lastActivity) s.lastActivity = d;
  };
  for (const sale of data.sales) {
    if (!sale.clientId) continue;
    const s = get(sale.clientId);
    s.sold += saleTotal(sale);
    s.saleCount++;
    if ((alloc.get(sale.id)?.open ?? 0) > 0) s.openSaleCount++;
    touch(s, sale.date);
  }
  for (const p of data.payments) {
    const s = get(p.clientId);
    s.received += p.amount;
    touch(s, p.date);
  }
  for (const s of out.values()) s.outstanding = s.sold - s.received;
  return out;
}

export function clientSummary(data: AppData, clientId: Id, today: string = todayFn()): ClientSummary {
  return (
    clientSummaries(data, today).get(clientId) ?? {
      clientId,
      sold: 0,
      received: 0,
      outstanding: 0,
      saleCount: 0,
      openSaleCount: 0,
    }
  );
}

/** "Owed to you": Σ positive client balances (credits are not netted against debts of others). */
export function totalOwedToYou(data: AppData, today: string = todayFn()): Cents {
  let t = 0;
  for (const s of clientSummaries(data, today).values()) if (s.outstanding > 0) t += s.outstanding;
  return t;
}

/** Sales of one client that still have an open amount, oldest first. */
export function openSalesForClient(data: AppData, clientId: Id, today: string = todayFn()): { sale: Sale; info: SalePaymentInfo }[] {
  const alloc = allocatePayments(data, today);
  return data.sales
    .filter((s) => s.clientId === clientId && (alloc.get(s.id)?.open ?? 0) > 0)
    .sort(bySaleOrder)
    .map((sale) => ({ sale, info: alloc.get(sale.id)! }));
}

export function paymentsForSale(data: AppData, saleId: Id): Payment[] {
  return data.payments.filter((p) => p.saleId === saleId);
}

// ---------- Batches & products ----------

export function batchStats(data: AppData): Map<Id, BatchStats> {
  const out = new Map<Id, BatchStats>();
  for (const b of data.batches) {
    out.set(b.id, {
      batchId: b.id,
      productId: b.productId,
      quantity: b.quantity,
      unitsSold: 0,
      unitsLeft: b.quantity,
      revenue: 0,
      costs: 0,
      profit: 0,
      costPerUnit: null,
    });
  }
  for (const s of data.sales) {
    for (const it of s.items) {
      if (!it.batchId) continue;
      const st = out.get(it.batchId);
      if (!st) continue;
      st.unitsSold += it.quantity;
      st.revenue += lineTotal(it);
    }
  }
  for (const e of data.expenses) {
    if (!e.batchId) continue;
    const st = out.get(e.batchId);
    if (st) st.costs += e.amount;
  }
  for (const st of out.values()) {
    st.unitsLeft = st.quantity - st.unitsSold;
    st.profit = st.revenue - st.costs;
    st.costPerUnit = st.quantity > 0 ? Math.round(st.costs / st.quantity) : null;
  }
  return out;
}

export function batchStat(data: AppData, batchId: Id): BatchStats | undefined {
  return batchStats(data).get(batchId);
}

/** Per product: all sales of the product (with or without batch) and costs of its batches. */
export function productStats(data: AppData, bStats = batchStats(data)): Map<Id, ProductStats> {
  const out = new Map<Id, ProductStats>();
  const get = (id: Id) => {
    let p = out.get(id);
    if (!p) out.set(id, (p = { productId: id, unitsSold: 0, revenue: 0, costs: 0, profit: 0, batchCount: 0 }));
    return p;
  };
  for (const p of data.products) get(p.id);
  for (const s of data.sales)
    for (const it of s.items) {
      const p = get(it.productId);
      p.unitsSold += it.quantity;
      p.revenue += lineTotal(it);
    }
  for (const b of data.batches) {
    const p = get(b.productId);
    p.batchCount++;
    p.costs += bStats.get(b.id)?.costs ?? 0;
  }
  for (const p of out.values()) p.profit = p.revenue - p.costs;
  return out;
}

/** Newest (by producedOn, then code) not-closed batch of a product – preselected in the sale form. */
export function newestOpenBatch(data: Pick<AppData, 'batches'>, productId: Id): Batch | undefined {
  let best: Batch | undefined;
  for (const b of data.batches) {
    if (b.productId !== productId || b.closed) continue;
    if (!best || b.producedOn > best.producedOn || (b.producedOn === best.producedOn && b.code > best.code)) best = b;
  }
  return best;
}

/** Expenses without a batch ("General costs"), optionally limited to a date range (by expense date). */
export function generalCosts(data: Pick<AppData, 'expenses'>, range: DateRange = {}): Cents {
  let t = 0;
  for (const e of data.expenses) if (!e.batchId && inRange(e.date, range)) t += e.amount;
  return t;
}

// ---------- Suppliers / what you owe ----------

export function isExpenseOverdue(e: Expense, today: string = todayFn()): boolean {
  return e.paidOn === null && !!e.dueDate && e.dueDate < today;
}

/**
 * Unpaid expenses grouped per supplier (supplierId null = no supplier), largest total first.
 * Only groups with at least one unpaid expense are returned.
 */
export function supplierOwed(data: Pick<AppData, 'expenses'>, today: string = todayFn()): SupplierOwed[] {
  const map = new Map<string, SupplierOwed>();
  for (const e of data.expenses) {
    if (e.paidOn !== null) continue;
    const key = e.supplierId ?? '';
    let g = map.get(key);
    if (!g) map.set(key, (g = { supplierId: e.supplierId ?? null, total: 0, overdueTotal: 0, overdue: false, expenses: [] }));
    g.total += e.amount;
    g.expenses.push(e);
    if (isExpenseOverdue(e, today)) {
      g.overdue = true;
      g.overdueTotal += e.amount;
    }
  }
  const out = [...map.values()];
  for (const g of out) g.expenses.sort((a, b) => compareDates(a.dueDate ?? a.date, b.dueDate ?? b.date));
  return out.sort((a, b) => b.total - a.total);
}

/** "You owe": Σ unpaid expenses. */
export function totalYouOwe(data: Pick<AppData, 'expenses'>): Cents {
  let t = 0;
  for (const e of data.expenses) if (e.paidOn === null) t += e.amount;
  return t;
}

// ---------- Periods ----------

/**
 * Summary for a date range.
 * moneyIn  = payments dated in range + clientless sales dated in range (cash in)
 * moneyOut = expenses with paidOn in range (cash out)
 * sold / costs / profit are booked amounts by sale/expense date (paid or not).
 */
export function periodSummary(data: AppData, range: DateRange): PeriodSummary {
  let moneyIn = 0;
  let moneyOut = 0;
  let sold = 0;
  let costs = 0;
  let saleCount = 0;
  let expenseCount = 0;
  for (const p of data.payments) if (inRange(p.date, range)) moneyIn += p.amount;
  for (const s of data.sales) {
    if (!inRange(s.date, range)) continue;
    const t = saleTotal(s);
    sold += t;
    saleCount++;
    if (!s.clientId) moneyIn += t;
  }
  for (const e of data.expenses) {
    if (inRange(e.date, range)) {
      costs += e.amount;
      expenseCount++;
    }
    if (e.paidOn !== null && inRange(e.paidOn, range)) moneyOut += e.amount;
  }
  return {
    range,
    moneyIn,
    moneyOut,
    result: moneyIn - moneyOut,
    sold,
    costs,
    profit: sold - costs,
    saleCount,
    expenseCount,
  };
}

/** One summary per month that has any activity, newest first. Keys are 'YYYY-MM'. */
export function monthlySummaries(data: AppData): { month: string; summary: PeriodSummary }[] {
  const months = new Set<string>();
  for (const s of data.sales) months.add(monthKey(s.date));
  for (const p of data.payments) months.add(monthKey(p.date));
  for (const e of data.expenses) {
    months.add(monthKey(e.date));
    if (e.paidOn) months.add(monthKey(e.paidOn));
  }
  return [...months]
    .sort()
    .reverse()
    .map((month) => {
      const from = `${month}-01`;
      const [y, m] = month.split('-').map(Number) as [number, number];
      const to = `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
      return { month, summary: periodSummary(data, { from, to }) };
    });
}

// ---------- References ----------

/** True when deleting `id` from `collection` would leave dangling references. Use archive instead. */
export function isReferenced(data: AppData, collection: CollectionName, id: Id): boolean {
  switch (collection) {
    case 'clients':
      return data.sales.some((s) => s.clientId === id) || data.payments.some((p) => p.clientId === id);
    case 'suppliers':
      return data.expenses.some((e) => e.supplierId === id);
    case 'products':
      return data.batches.some((b) => b.productId === id) || data.sales.some((s) => s.items.some((i) => i.productId === id));
    case 'batches':
      return data.expenses.some((e) => e.batchId === id) || data.sales.some((s) => s.items.some((i) => i.batchId === id));
    case 'categories':
      return data.expenses.some((e) => e.categoryId === id);
    case 'sales':
      return data.payments.some((p) => p.saleId === id);
    case 'payments':
    case 'expenses':
    case 'importRows':
      return false;
  }
}

/** Collections where `remove` is refused while `isReferenced` is true. */
export const PROTECTED_COLLECTIONS: readonly CollectionName[] = ['clients', 'suppliers', 'products', 'batches', 'categories'];

/** True when there is no user content at all (settings and seeded categories don't count). */
export function hasUserContent(data: AppData): boolean {
  return (
    data.clients.length > 0 ||
    data.suppliers.length > 0 ||
    data.products.length > 0 ||
    data.batches.length > 0 ||
    data.sales.length > 0 ||
    data.payments.length > 0 ||
    data.expenses.length > 0 ||
    data.importRows.length > 0
  );
}
