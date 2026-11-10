/** Pure helpers for the Batches screen (unit tested). */
import { newId } from '../../domain/ids';
import { normalizeDescription } from '../../domain/importing';
import type { Batch, Cents, ISODate, Id, Product, Sale, SaleItem } from '../../domain/types';

/**
 * Product abbreviation for batch codes: initials of up to 3 words ("Sambal Pittig" → "SP",
 * "Habanero Hot Sauce" → "HHS"), or the first 3 letters of a single word ("Ketjap" → "KET").
 * Accents and symbols are dropped. Fallback "B".
 */
export function productAbbr(name: string): string {
  const words = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter(Boolean);
  if (words.length === 0) return 'B';
  if (words.length === 1) return words[0]!.slice(0, 3);
  return words
    .slice(0, 3)
    .map((w) => w[0])
    .join('');
}

/** "<ABBR>-<YYMMDD>", with "-2", "-3"… when that code already exists for the product. */
export function suggestBatchCode(productName: string, producedOn: ISODate, existingCodes: string[]): string {
  const base = `${productAbbr(productName)}-${producedOn.slice(2, 4)}${producedOn.slice(5, 7)}${producedOn.slice(8, 10)}`;
  const taken = new Set(existingCodes.map((c) => c.trim().toUpperCase()));
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
}

/** Codes of other batches of the same product. */
export function siblingCodes(batches: Batch[], productId: Id | undefined, ownId?: Id): string[] {
  return batches.filter((b) => b.productId === productId && b.id !== ownId).map((b) => b.code);
}

/** Batches of a product: open first, newest produced first. */
export function sortBatches(batches: Batch[]): Batch[] {
  return [...batches].sort((a, b) => Number(a.closed) - Number(b.closed) || b.producedOn.localeCompare(a.producedOn) || b.code.localeCompare(a.code));
}

export interface BatchFormState {
  productId: Id | undefined;
  code: string;
  producedOn: ISODate | undefined;
  quantity: string;
  notes: string;
}

export function batchForm(b?: Batch, defaults: { productId?: Id; producedOn?: ISODate } = {}): BatchFormState {
  return {
    productId: b?.productId ?? defaults.productId,
    code: b?.code ?? '',
    producedOn: b?.producedOn ?? defaults.producedOn,
    quantity: b ? String(b.quantity) : '',
    notes: b?.notes ?? '',
  };
}

/** Whole, non-negative number from user text ("1.200" / "1 200" allowed), else null. */
export function parseQuantity(s: string): number | null {
  const t = s.replace(/[\s.]/g, '').trim();
  if (!/^\d+$/.test(t)) return null;
  return Number(t);
}

export type BatchFormErrors = Partial<Record<'productId' | 'code' | 'producedOn' | 'quantity', 'required' | 'invalidQuantity' | 'codeExists'>>;

export function validateBatchForm(f: BatchFormState, existingCodes: string[]): BatchFormErrors {
  const e: BatchFormErrors = {};
  if (!f.productId) e.productId = 'required';
  if (!f.code.trim()) e.code = 'required';
  else if (existingCodes.some((c) => c.trim().toUpperCase() === f.code.trim().toUpperCase())) e.code = 'codeExists';
  if (!f.producedOn) e.producedOn = 'required';
  if (!f.quantity.trim()) e.quantity = 'required';
  else if (parseQuantity(f.quantity) === null) e.quantity = 'invalidQuantity';
  return e;
}

export function batchFromForm(f: BatchFormState, original?: Batch): Batch {
  const q = parseQuantity(f.quantity);
  if (!f.productId || !f.producedOn || q === null) throw new Error('Invalid batch form');
  const b: Batch = { id: original?.id ?? newId(), productId: f.productId, code: f.code.trim(), producedOn: f.producedOn, quantity: q, closed: original?.closed ?? false };
  if (f.notes.trim()) b.notes = f.notes.trim();
  return b;
}

export interface ProductFormState {
  name: string;
  unit: string;
  defaultPrice: Cents | null;
}

export function productForm(p: Product | undefined, defaultUnit: string): ProductFormState {
  return { name: p?.name ?? '', unit: p?.unit ?? defaultUnit, defaultPrice: p ? p.defaultPrice : null };
}

export function productFromForm(f: ProductFormState, original: Product | undefined, defaultUnit: string): Product {
  return { id: original?.id ?? newId(), name: f.name.trim(), unit: f.unit.trim() || defaultUnit, defaultPrice: f.defaultPrice ?? 0, archived: original?.archived ?? false };
}

export function isDuplicateProduct(products: Product[], name: string, ownId?: Id): boolean {
  const n = normalizeDescription(name);
  return !!n && products.some((p) => p.id !== ownId && normalizeDescription(p.name) === n);
}

export interface BatchSaleLine {
  sale: Sale;
  item: SaleItem;
}

/** Sale lines taken from a batch, newest first. */
export function salesForBatch(sales: Sale[], batchId: Id): BatchSaleLine[] {
  const out: BatchSaleLine[] = [];
  for (const sale of sales) for (const item of sale.items) if (item.batchId === batchId) out.push({ sale, item });
  return out.sort((a, b) => b.sale.date.localeCompare(a.sale.date));
}
