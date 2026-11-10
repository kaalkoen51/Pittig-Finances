/** Pure helpers for the expense add/edit form (unit tested). */
import { addDays } from '../../domain/dates';
import { newId } from '../../domain/ids';
import { normalizeDescription } from '../../domain/importing';
import type { AppData, Batch, Category, Cents, Expense, ISODate, Id, Product } from '../../domain/types';

export const DEFAULT_DUE_DAYS = 30;

export interface ExpenseFormState {
  /** Positive amount in cents as typed (sign comes from `refund`). */
  amount: Cents | null;
  refund: boolean;
  date: ISODate | undefined;
  description: string;
  categoryId: Id | undefined;
  supplierId: Id | undefined;
  /** undefined = general cost (not linked to a batch). */
  batchId: Id | undefined;
  paid: boolean;
  dueDate: ISODate | undefined;
}

export interface ExpenseDefaults {
  date?: ISODate;
  categoryId?: Id;
  supplierId?: Id;
  batchId?: Id;
  description?: string;
  amount?: Cents;
}

/** Initial state for a new expense: today, last used category, "paid already" on. */
export function newExpenseForm(today: ISODate, defaults: ExpenseDefaults = {}): ExpenseFormState {
  return {
    amount: defaults.amount != null ? Math.abs(defaults.amount) : null,
    refund: (defaults.amount ?? 0) < 0,
    date: defaults.date ?? today,
    description: defaults.description ?? '',
    categoryId: defaults.categoryId,
    supplierId: defaults.supplierId,
    batchId: defaults.batchId,
    paid: true,
    dueDate: undefined,
  };
}

export function formFromExpense(e: Expense): ExpenseFormState {
  return {
    amount: Math.abs(e.amount),
    refund: e.amount < 0,
    date: e.date,
    description: e.description,
    categoryId: e.categoryId,
    supplierId: e.supplierId,
    batchId: e.batchId,
    paid: e.paidOn !== null,
    dueDate: e.dueDate,
  };
}

export type ExpenseFormErrors = Partial<Record<'amount' | 'date' | 'category' | 'dueDate', 'required' | 'invalidAmount'>>;

export function validateExpenseForm(f: ExpenseFormState): ExpenseFormErrors {
  const errors: ExpenseFormErrors = {};
  if (f.amount === null) errors.amount = 'required';
  else if (f.amount === 0) errors.amount = 'invalidAmount';
  if (!f.date) errors.date = 'required';
  if (!f.categoryId) errors.category = 'required';
  if (!f.paid && !f.dueDate) errors.dueDate = 'required';
  return errors;
}

/**
 * Builds the Expense to save. `original` keeps the id and the original paidOn when an already-paid
 * expense is edited; a new "paid already" expense is paid on its own date.
 * Optional fields are omitted when empty.
 */
export function expenseFromForm(f: ExpenseFormState, original?: Expense): Expense {
  if (f.amount === null || !f.date || !f.categoryId) throw new Error('Invalid expense form');
  const abs = Math.abs(f.amount);
  const e: Expense = {
    id: original?.id ?? newId(),
    date: f.date,
    categoryId: f.categoryId,
    description: f.description.trim(),
    amount: f.refund ? -abs : abs,
    paidOn: f.paid ? (original?.paidOn ?? f.date) : null,
  };
  if (f.supplierId) e.supplierId = f.supplierId;
  if (f.batchId) e.batchId = f.batchId;
  // Unpaid: due date required. Paid: keep a due date only if the original had one.
  if (f.dueDate && (!f.paid || original?.dueDate)) e.dueDate = f.dueDate;
  return e;
}

/** Default due date when "Paid already" is switched off. */
export function defaultDueDate(date: ISODate): ISODate {
  return addDays(date, DEFAULT_DUE_DAYS);
}

/** Supplier of the most recent expense in this category (smart default), if any. */
export function supplierForCategory(expenses: Expense[], categoryId: Id | undefined): Id | undefined {
  if (!categoryId) return undefined;
  let best: Expense | undefined;
  for (const e of expenses) {
    if (e.categoryId !== categoryId || !e.supplierId) continue;
    if (!best || e.date > best.date) best = e;
  }
  return best?.supplierId;
}

/** Colours for new categories (readable in light and dark mode). */
export const CATEGORY_COLORS = ['#D9822B', '#8E6C4A', '#B05BC4', '#5B7BD5', '#2F9E8F', '#D4A72C', '#D2463A', '#4E9A45', '#C2577A', '#3D8FC4', '#8E8E93'];

/** First palette colour not used yet; cycles when all are used. */
export function pickCategoryColor(categories: Pick<Category, 'color'>[]): string {
  const used = new Set(categories.map((c) => c.color.toLowerCase()));
  return CATEGORY_COLORS.find((c) => !used.has(c.toLowerCase())) ?? CATEGORY_COLORS[categories.length % CATEGORY_COLORS.length]!;
}

/** Returns an existing category with the same name (case/accents ignored), or a new one. */
export function findOrMakeCategory(categories: Category[], name: string): { category: Category; created: boolean } {
  const n = normalizeDescription(name);
  const existing = categories.find((c) => normalizeDescription(c.name) === n);
  if (existing) return { category: existing, created: false };
  return { category: { id: newId(), name: name.trim(), color: pickCategoryColor(categories), archived: false }, created: true };
}

export interface BatchOption {
  value: Id;
  label: string;
}
export interface BatchOptionGroup {
  productId: Id;
  label: string;
  options: BatchOption[];
}

/**
 * Batch picker groups: one per product (product name order), open batches first (newest first),
 * then closed ones (marked with `closedSuffix`). Batches of archived products are only included
 * when one of them is the currently selected batch.
 */
export function batchOptionGroups(
  data: Pick<AppData, 'products' | 'batches'>,
  selectedId: Id | undefined,
  closedSuffix: string,
): BatchOptionGroup[] {
  const products = [...data.products].sort((a: Product, b: Product) => a.name.localeCompare(b.name));
  const groups: BatchOptionGroup[] = [];
  for (const p of products) {
    const batches = data.batches.filter((b) => b.productId === p.id && (!p.archived || b.id === selectedId));
    if (!batches.length) continue;
    const sorted = [...batches].sort((a: Batch, b: Batch) => {
      if (a.closed !== b.closed) return a.closed ? 1 : -1;
      return b.producedOn.localeCompare(a.producedOn) || b.code.localeCompare(a.code);
    });
    groups.push({
      productId: p.id,
      label: p.name,
      options: sorted.map((b) => ({ value: b.id, label: b.closed ? `${b.code} ${closedSuffix}` : b.code })),
    });
  }
  return groups;
}
