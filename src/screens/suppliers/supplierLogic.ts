/** Pure helpers for the Suppliers ("Who I owe") screen (unit tested). */
import { newId } from '../../domain/ids';
import { normalizeDescription } from '../../domain/importing';
import type { Cents, Expense, ISODate, Id, Supplier, SupplierOwed } from '../../domain/types';

export interface SupplierRow {
  supplier: Supplier;
  owed: Cents;
  overdueTotal: Cents;
  overdue: boolean;
  openCount: number;
}

/**
 * Rows for the supplier list: active suppliers, plus archived ones that still have something owed
 * (money owed is never hidden). Sorted: overdue first, then most owed, then name.
 */
export function supplierRows(suppliers: Supplier[], owed: SupplierOwed[], includeArchived = false): SupplierRow[] {
  const bySupplier = new Map(owed.filter((o) => o.supplierId).map((o) => [o.supplierId!, o]));
  return suppliers
    .map((supplier) => {
      const o = bySupplier.get(supplier.id);
      return { supplier, owed: o?.total ?? 0, overdueTotal: o?.overdueTotal ?? 0, overdue: o?.overdue ?? false, openCount: o?.expenses.length ?? 0 };
    })
    .filter((r) => includeArchived || !r.supplier.archived || r.openCount > 0)
    .sort((a, b) => Number(b.overdue) - Number(a.overdue) || b.owed - a.owed || a.supplier.name.localeCompare(b.supplier.name));
}

/** Copies of the given unpaid expenses, marked paid on `on`. Already-paid ones are skipped. */
export function markPaid(expenses: Expense[], on: ISODate): Expense[] {
  return expenses.filter((e) => e.paidOn === null).map((e) => ({ ...e, paidOn: on }));
}

/** Unpaid (oldest due first) and paid (newest payment first) expenses of a supplier (null = none). */
export function supplierExpenses(expenses: Expense[], supplierId: Id | null): { unpaid: Expense[]; paid: Expense[] } {
  const mine = expenses.filter((e) => (supplierId === null ? !e.supplierId : e.supplierId === supplierId));
  const unpaid = mine.filter((e) => e.paidOn === null).sort((a, b) => (a.dueDate ?? a.date).localeCompare(b.dueDate ?? b.date));
  const paid = mine
    .filter((e) => e.paidOn !== null)
    .sort((a, b) => (b.paidOn ?? '').localeCompare(a.paidOn ?? '') || b.date.localeCompare(a.date));
  return { unpaid, paid };
}

export interface SupplierFormState {
  name: string;
  email: string;
  phone: string;
  notes: string;
}

export function supplierForm(s?: Supplier): SupplierFormState {
  return { name: s?.name ?? '', email: s?.email ?? '', phone: s?.phone ?? '', notes: s?.notes ?? '' };
}

/** Builds the Supplier; empty optional fields are omitted. */
export function supplierFromForm(f: SupplierFormState, original?: Supplier): Supplier {
  const s: Supplier = { id: original?.id ?? newId(), name: f.name.trim(), archived: original?.archived ?? false };
  if (f.email.trim()) s.email = f.email.trim();
  if (f.phone.trim()) s.phone = f.phone.trim();
  if (f.notes.trim()) s.notes = f.notes.trim();
  return s;
}

/** True when another supplier already has this name (case/accents ignored). */
export function isDuplicateName(suppliers: Supplier[], name: string, ownId?: Id): boolean {
  const n = normalizeDescription(name);
  return !!n && suppliers.some((s) => s.id !== ownId && normalizeDescription(s.name) === n);
}
