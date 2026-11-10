/** Pure list helpers for the Expenses screen (unit tested). */
import { monthKey } from '../../domain/dates';
import { normalizeDescription } from '../../domain/importing';
import type { Batch, Category, Cents, Expense, ISODate, Id, Supplier } from '../../domain/types';
import { isExpenseOverdue } from '../../domain/calc';

export interface ExpenseFilter {
  query: string;
  categoryId?: Id;
  unpaidOnly: boolean;
}

export interface ExpenseLookups {
  categoryById: Map<Id, Category>;
  supplierById: Map<Id, Supplier>;
  batchById: Map<Id, Batch>;
}

/** Text a search query is matched against: description, supplier, category, batch code, amount. */
export function expenseSearchText(e: Expense, l: ExpenseLookups): string {
  const parts = [
    e.description,
    e.supplierId ? l.supplierById.get(e.supplierId)?.name : '',
    l.categoryById.get(e.categoryId)?.name,
    e.batchId ? l.batchById.get(e.batchId)?.code : '',
    (Math.abs(e.amount) / 100).toFixed(2).replace('.', ','),
    (Math.abs(e.amount) / 100).toFixed(2),
  ];
  return normalizeDescription(parts.filter(Boolean).join(' '));
}

export function filterExpenses(expenses: Expense[], f: ExpenseFilter, l: ExpenseLookups): Expense[] {
  const words = normalizeDescription(f.query).split(' ').filter(Boolean);
  return expenses.filter((e) => {
    if (f.categoryId && e.categoryId !== f.categoryId) return false;
    if (f.unpaidOnly && e.paidOn !== null) return false;
    if (words.length) {
      const text = expenseSearchText(e, l);
      if (!words.every((w) => text.includes(w))) return false;
    }
    return true;
  });
}

export interface MonthGroup {
  /** 'YYYY-MM' */
  month: string;
  total: Cents;
  expenses: Expense[];
}

/** Groups by expense month, newest month first; inside a month newest date first. */
export function groupByMonth(expenses: Expense[]): MonthGroup[] {
  const map = new Map<string, MonthGroup>();
  for (const e of expenses) {
    const key = monthKey(e.date);
    let g = map.get(key);
    if (!g) map.set(key, (g = { month: key, total: 0, expenses: [] }));
    g.total += e.amount;
    g.expenses.push(e);
  }
  const groups = [...map.values()].sort((a, b) => b.month.localeCompare(a.month));
  for (const g of groups) g.expenses.sort((a, b) => b.date.localeCompare(a.date) || a.description.localeCompare(b.description));
  return groups;
}

export type ExpenseStatus = 'paid' | 'unpaid' | 'overdue';

export function expenseStatus(e: Expense, today: ISODate): ExpenseStatus {
  if (e.paidOn !== null) return 'paid';
  return isExpenseOverdue(e, today) ? 'overdue' : 'unpaid';
}
