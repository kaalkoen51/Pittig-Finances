import { describe, expect, it } from 'vitest';
import { demoData } from '../../domain/fixtures';
import type { Expense } from '../../domain/types';
import {
  batchOptionGroups,
  defaultDueDate,
  expenseFromForm,
  findOrMakeCategory,
  formFromExpense,
  newExpenseForm,
  pickCategoryColor,
  supplierForCategory,
  validateExpenseForm,
} from './expenseForm';
import { expenseStatus, filterExpenses, groupByMonth } from './expenseList';

const exp = (p: Partial<Expense>): Expense => ({ id: 'x', date: '2026-03-10', categoryId: 'c1', description: 'Pepers', amount: 1000, paidOn: '2026-03-10', ...p });

describe('expense form mapping', () => {
  it('new form defaults: today, paid, no due date', () => {
    const f = newExpenseForm('2026-11-10', { categoryId: 'c1', batchId: 'b1' });
    expect(f).toMatchObject({ date: '2026-11-10', paid: true, refund: false, categoryId: 'c1', batchId: 'b1', amount: null });
  });

  it('paid new expense is paid on its date, optional fields omitted', () => {
    const f = { ...newExpenseForm('2026-11-10'), amount: 1250, categoryId: 'c1', description: '  Potten ' };
    const e = expenseFromForm(f);
    expect(e).toMatchObject({ date: '2026-11-10', paidOn: '2026-11-10', amount: 1250, description: 'Potten' });
    expect('supplierId' in e).toBe(false);
    expect('batchId' in e).toBe(false);
    expect('dueDate' in e).toBe(false);
  });

  it('unpaid expense becomes owed with due date; refund is negative', () => {
    const f = { ...newExpenseForm('2026-11-10'), amount: 500, categoryId: 'c1', paid: false, dueDate: defaultDueDate('2026-11-10'), refund: true, supplierId: 's1' };
    const e = expenseFromForm(f);
    expect(e.paidOn).toBeNull();
    expect(e.dueDate).toBe('2026-12-10');
    expect(e.amount).toBe(-500);
    expect(e.supplierId).toBe('s1');
  });

  it('editing keeps id and original paidOn; round-trips', () => {
    const orig = exp({ id: 'keep', paidOn: '2026-04-01', dueDate: '2026-04-09', amount: -300, batchId: 'b1' });
    const f = formFromExpense(orig);
    expect(f.amount).toBe(300);
    expect(f.refund).toBe(true);
    expect(expenseFromForm(f, orig)).toEqual(orig);
  });

  it('drops a stale due date when a new expense is switched back to paid', () => {
    const f = { ...newExpenseForm('2026-11-10'), amount: 500, categoryId: 'c1', paid: true, dueDate: '2026-12-10' };
    expect('dueDate' in expenseFromForm(f)).toBe(false);
  });

  it('validates required fields', () => {
    const f = newExpenseForm('2026-11-10');
    expect(validateExpenseForm(f)).toEqual({ amount: 'required', category: 'required' });
    expect(validateExpenseForm({ ...f, amount: 0, categoryId: 'c', paid: false })).toEqual({ amount: 'invalidAmount', dueDate: 'required' });
  });

  it('suggests the supplier last used for a category', () => {
    const list = [exp({ supplierId: 'a', date: '2026-01-01' }), exp({ supplierId: 'b', date: '2026-02-01' }), exp({ categoryId: 'c2', supplierId: 'z', date: '2026-05-01' })];
    expect(supplierForCategory(list, 'c1')).toBe('b');
    expect(supplierForCategory(list, 'none')).toBeUndefined();
  });

  it('finds existing categories by name and picks an unused colour for new ones', () => {
    const cats = demoData('2026-11-10').categories;
    expect(findOrMakeCategory(cats, 'transport ')).toMatchObject({ created: false, category: { id: 'demo-cat-transport' } });
    const made = findOrMakeCategory(cats, 'Huur keuken');
    expect(made.created).toBe(true);
    expect(cats.map((c) => c.color)).not.toContain(made.category.color);
    expect(pickCategoryColor([])).toBe('#D9822B');
  });

  it('groups batch options per product, open batches first', () => {
    const d = demoData('2026-11-10');
    const groups = batchOptionGroups(d, undefined, '(afgesloten)');
    expect(groups.map((g) => g.label)).toEqual(['Habanero Hot Sauce', 'Sambal Pittig']);
    expect(groups[1]!.options.map((o) => o.label)).toEqual(['S-02', 'S-01 (afgesloten)']);
  });
});

describe('expense list', () => {
  const d = demoData('2026-11-10');
  const lookups = {
    categoryById: new Map(d.categories.map((c) => [c.id, c])),
    supplierById: new Map(d.suppliers.map((s) => [s.id, s])),
    batchById: new Map(d.batches.map((b) => [b.id, b])),
  };

  it('groups by month newest first with totals', () => {
    const g = groupByMonth([exp({ id: '1', date: '2026-02-03', amount: 100 }), exp({ id: '2', date: '2026-03-01', amount: 200 }), exp({ id: '3', date: '2026-03-20', amount: -50 })]);
    expect(g.map((x) => x.month)).toEqual(['2026-03', '2026-02']);
    expect(g[0]!.total).toBe(150);
    expect(g[0]!.expenses.map((e) => e.id)).toEqual(['3', '2']);
  });

  it('filters on search words across supplier/category, category and unpaid', () => {
    const all = d.expenses;
    const unpaid = filterExpenses(all, { query: '', unpaidOnly: true }, lookups);
    expect(unpaid.length).toBeGreaterThan(0);
    expect(unpaid.every((e) => e.paidOn === null)).toBe(true);
    const bySupplier = filterExpenses(all, { query: 'drukkerij', unpaidOnly: false }, lookups);
    expect(bySupplier.length).toBeGreaterThan(0);
    expect(bySupplier.every((e) => e.supplierId === 'demo-s-print')).toBe(true);
    const byCat = filterExpenses(all, { query: '', categoryId: 'demo-cat-ingr', unpaidOnly: false }, lookups);
    expect(byCat.every((e) => e.categoryId === 'demo-cat-ingr')).toBe(true);
    expect(filterExpenses(all, { query: 'zzzz', unpaidOnly: false }, lookups)).toEqual([]);
  });

  it('status: paid / unpaid / overdue', () => {
    expect(expenseStatus(exp({}), '2026-11-10')).toBe('paid');
    expect(expenseStatus(exp({ paidOn: null, dueDate: '2026-12-01' }), '2026-11-10')).toBe('unpaid');
    expect(expenseStatus(exp({ paidOn: null, dueDate: '2026-11-01' }), '2026-11-10')).toBe('overdue');
  });
});
