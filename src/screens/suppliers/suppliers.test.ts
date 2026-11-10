import { describe, expect, it } from 'vitest';
import { supplierOwed } from '../../domain/calc';
import { demoData } from '../../domain/fixtures';
import { isDuplicateName, markPaid, supplierExpenses, supplierForm, supplierFromForm, supplierRows } from './supplierLogic';

const d = demoData('2026-11-10');

describe('supplier rows', () => {
  it('puts overdue suppliers first, then most owed, then name', () => {
    const rows = supplierRows(d.suppliers, supplierOwed(d, '2026-11-10'));
    expect(rows[0]!.supplier.id).toBe('demo-s-jars');
    expect(rows[0]!.overdue).toBe(true);
    expect(rows[1]!.supplier.id).toBe('demo-s-print');
    expect(rows[1]!.owed).toBe(8950);
    expect(rows.slice(2).map((r) => r.owed)).toEqual([0, 0]);
  });

  it('hides archived suppliers unless they are still owed money', () => {
    const sups = d.suppliers.map((s) => (s.id === 'demo-s-print' || s.id === 'demo-s-markt' ? { ...s, archived: true } : s));
    const ids = supplierRows(sups, supplierOwed(d, '2026-11-10')).map((r) => r.supplier.id);
    expect(ids).toContain('demo-s-print');
    expect(ids).not.toContain('demo-s-markt');
  });
});

describe('mark as paid', () => {
  it('marks only unpaid expenses, on the given date', () => {
    const out = markPaid(d.expenses, '2026-11-10');
    expect(out.map((e) => e.id).sort()).toEqual(['demo-e-6', 'demo-e-7']);
    expect(out.every((e) => e.paidOn === '2026-11-10')).toBe(true);
  });

  it('splits a supplier’s expenses into unpaid and paid history', () => {
    const { unpaid, paid } = supplierExpenses(d.expenses, 'demo-s-jars');
    expect(unpaid.map((e) => e.id)).toEqual(['demo-e-6']);
    expect(paid.map((e) => e.id)).toEqual(['demo-e-4', 'demo-e-2']);
    expect(supplierExpenses(d.expenses, null).paid.map((e) => e.id)).toEqual(['demo-e-10']);
  });
});

describe('supplier form', () => {
  it('omits empty optional fields and keeps archived', () => {
    const s = supplierFromForm({ ...supplierForm(), name: ' Jansen ', email: ' ', phone: '0612' });
    expect(s).toMatchObject({ name: 'Jansen', phone: '0612', archived: false });
    expect('email' in s).toBe(false);
    const orig = { id: 'x', name: 'A', archived: true, notes: 'n' };
    expect(supplierFromForm(supplierForm(orig), orig)).toEqual(orig);
  });
  it('detects duplicate names', () => {
    expect(isDuplicateName(d.suppliers, 'verpakking direct')).toBe(true);
    expect(isDuplicateName(d.suppliers, 'Verpakking Direct', 'demo-s-jars')).toBe(false);
  });
});
