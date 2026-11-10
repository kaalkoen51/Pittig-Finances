/**
 * Pure mapping between the sale form state and Sale / Payment records. No React.
 *
 * "Paid already" rule (PLAN revisions): a sale with a client and the toggle on gets a Payment
 * {clientId, saleId, amount: total, date: sale.date, auto: true}. When editing, the toggle controls
 * only that explicitly marked "auto" payment. Real payments (bank import, recorded payments) are
 * never rewritten or deleted by editing the sale, even when one equals the total.
 */
import { lineTotal, newestOpenBatch, saleTotal } from '../../domain/calc';
import { newId } from '../../domain/ids';
import type { AppData, Batch, Cents, Id, ISODate, Payment, Product, Sale, SaleItem } from '../../domain/types';

export interface LineState {
  key: string;
  productId?: Id;
  batchId?: Id;
  /** Raw text so "1,5" can be typed. */
  quantity: string;
  unitPrice: Cents | null;
}

export interface SaleFormState {
  date: ISODate | undefined;
  clientId?: Id;
  lines: LineState[];
  paid: boolean;
  dueDate?: ISODate;
  notes: string;
}

export type SaleFormErrors = Partial<Record<'date' | 'lines', string>> & {
  line?: Record<string, Partial<Record<'productId' | 'quantity' | 'unitPrice', 'required' | 'invalidAmount'>>>;
};

let keySeq = 0;
export const lineKey = () => `l${++keySeq}`;

/** "1,5" / "1.5" / "3" → number; null when not a positive number. */
export function parseQuantity(s: string): number | null {
  const t = s.trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return n > 0 ? n : null;
}

export function formatQuantity(n: number, lang: 'nl' | 'en' = 'en'): string {
  const s = String(Math.round(n * 1000) / 1000);
  return lang === 'nl' ? s.replace('.', ',') : s;
}

/** A line for `productId` with its newest open batch and default price. */
export function lineForProduct(data: Pick<AppData, 'batches' | 'products'>, productId: Id | undefined, base?: Partial<LineState>): LineState {
  const product = productId ? data.products.find((p) => p.id === productId) : undefined;
  return {
    key: base?.key ?? lineKey(),
    quantity: base?.quantity ?? '1',
    ...(product ? { productId: product.id } : {}),
    ...(product ? withBatch(newestOpenBatch(data, product.id)) : {}),
    unitPrice: product ? product.defaultPrice || null : (base?.unitPrice ?? null),
  };
}

function withBatch(b: Batch | undefined): { batchId?: Id } {
  return b ? { batchId: b.id } : {};
}

/** Line total in cents, or null when quantity/price are not valid yet. */
export function lineStateTotal(l: LineState): Cents | null {
  const q = parseQuantity(l.quantity);
  if (q === null || l.unitPrice === null) return null;
  return lineTotal({ productId: '', quantity: q, unitPrice: l.unitPrice });
}

export function formTotal(f: SaleFormState): Cents {
  let t = 0;
  for (const l of f.lines) t += lineStateTotal(l) ?? 0;
  return t;
}

/**
 * The payment that the "Paid already" toggle controls for `sale`, if any: the linked payment marked
 * `auto: true`. Legacy data (before the flag existed): a single linked payment without `auto`,
 * method and notes, dated on the sale date for exactly the total – what the old toggle wrote. Payments
 * from the payment form or a bank import always have a method, so they never qualify.
 */
export function autoPaymentFor(sale: Sale, linked: Payment[]): Payment | undefined {
  const marked = linked.find((p) => p.auto === true && p.clientId === sale.clientId);
  if (marked) return marked;
  if (linked.length !== 1) return undefined;
  const p = linked[0]!;
  const legacy = p.auto === undefined && p.method === undefined && p.notes === undefined && p.date === sale.date;
  return legacy && p.amount === saleTotal(sale) && p.clientId === sale.clientId ? p : undefined;
}

export interface NewSaleDefaults {
  today: ISODate;
  lastClientId?: Id;
  lastProductId?: Id;
  clientId?: Id;
}

export function emptySaleForm(data: Pick<AppData, 'batches' | 'products' | 'clients'>, d: NewSaleDefaults): SaleFormState {
  const activeProducts = data.products.filter((p) => !p.archived);
  const lastProduct = activeProducts.find((p) => p.id === d.lastProductId);
  const productId = lastProduct?.id ?? (activeProducts.length === 1 ? activeProducts[0]!.id : undefined);
  const clientId = d.clientId ?? (data.clients.some((c) => c.id === d.lastClientId && !c.archived) ? d.lastClientId : undefined);
  return {
    date: d.today,
    ...(clientId ? { clientId } : {}),
    lines: [lineForProduct(data, productId)],
    paid: false,
    notes: '',
  };
}

export function saleToForm(sale: Sale, linked: Payment[], lang: 'nl' | 'en' = 'en'): SaleFormState {
  return {
    date: sale.date,
    ...(sale.clientId ? { clientId: sale.clientId } : {}),
    lines: sale.items.map((it) => ({
      key: lineKey(),
      productId: it.productId,
      ...(it.batchId ? { batchId: it.batchId } : {}),
      quantity: formatQuantity(it.quantity, lang),
      unitPrice: it.unitPrice,
    })),
    paid: !!autoPaymentFor(sale, linked),
    ...(sale.dueDate ? { dueDate: sale.dueDate } : {}),
    notes: sale.notes ?? '',
  };
}

export function validateSaleForm(f: SaleFormState): SaleFormErrors {
  const errors: SaleFormErrors = {};
  if (!f.date) errors.date = 'required';
  const line: NonNullable<SaleFormErrors['line']> = {};
  for (const l of f.lines) {
    const e: Partial<Record<'productId' | 'quantity' | 'unitPrice', 'required' | 'invalidAmount'>> = {};
    if (!l.productId) e.productId = 'required';
    if (parseQuantity(l.quantity) === null) e.quantity = l.quantity.trim() ? 'invalidAmount' : 'required';
    if (l.unitPrice === null) e.unitPrice = 'required';
    if (Object.keys(e).length) line[l.key] = e;
  }
  if (Object.keys(line).length) errors.line = line;
  if (!f.lines.length) errors.lines = 'required';
  return errors;
}

export function hasErrors(e: SaleFormErrors): boolean {
  return !!(e.date || e.lines || (e.line && Object.keys(e.line).length));
}

export interface SaleSavePlan {
  sale: Sale;
  upsertPayments: Payment[];
  removePaymentIds: Id[];
  /** Products created inline without a price get the price used here as default. */
  productPriceUpdates: Product[];
}

/**
 * Turn a valid form into the records to write.
 * `existing` = the sale being edited (undefined for new) and the payments linked to it by saleId.
 */
export function buildSaleSave(
  f: SaleFormState,
  opts: { existing?: Sale; linked?: Payment[]; products?: Product[]; id?: Id } = {},
): SaleSavePlan {
  const { existing, linked = [], products = [] } = opts;
  const items: SaleItem[] = f.lines.map((l) => ({
    productId: l.productId!,
    ...(l.batchId ? { batchId: l.batchId } : {}),
    quantity: parseQuantity(l.quantity)!,
    unitPrice: l.unitPrice!,
  }));
  const notes = f.notes.trim();
  const clientId = f.clientId;
  const paid = !!clientId && f.paid;
  const sale: Sale = {
    id: existing?.id ?? opts.id ?? newId(),
    date: f.date!,
    ...(clientId ? { clientId } : {}),
    items,
    ...(notes ? { notes } : {}),
    ...(clientId && !paid && f.dueDate ? { dueDate: f.dueDate } : {}),
  };
  const total = saleTotal(sale);
  const auto = existing ? autoPaymentFor(existing, linked) : undefined;
  const others = linked.filter((p) => p !== auto);

  const upsertPayments: Payment[] = [];
  const removePaymentIds: Id[] = [];

  if (paid) {
    upsertPayments.push({
      ...(auto ?? {}),
      id: auto?.id ?? newId(),
      date: sale.date,
      clientId: clientId!,
      saleId: sale.id,
      amount: total,
      auto: true,
    });
  } else if (auto) {
    removePaymentIds.push(auto.id);
  }

  // Other linked payments follow the sale's client; if the sale became walk-in they stay with
  // their client as credit (saleId dropped).
  for (const p of others) {
    if (clientId && p.clientId !== clientId) upsertPayments.push({ ...p, clientId });
    else if (!clientId) {
      const { saleId: _s, ...rest } = p;
      upsertPayments.push(rest);
    }
  }

  const productPriceUpdates: Product[] = [];
  for (const it of items) {
    const p = products.find((x) => x.id === it.productId);
    if (p && p.defaultPrice === 0 && it.unitPrice > 0 && !productPriceUpdates.some((u) => u.id === p.id)) {
      productPriceUpdates.push({ ...p, defaultPrice: it.unitPrice });
    }
  }

  return { sale, upsertPayments, removePaymentIds, productPriceUpdates };
}

/** Whether the paid toggle applies when editing (false when partial payments already exist). */
export function canTogglePaid(existing: Sale | undefined, linked: Payment[], alreadyPaid: Cents = 0): boolean {
  if (!existing) return true;
  if (linked.length === 0) return alreadyPaid <= 0;
  return linked.length === 1 && !!autoPaymentFor(existing, linked);
}

/** Short "40× Sambal, 12× Habanero" summary. */
export function itemsSummary(sale: Sale, productName: (id: Id) => string, lang: 'nl' | 'en' = 'en'): string {
  return sale.items.map((it) => `${formatQuantity(it.quantity, lang)}× ${productName(it.productId)}`).join(', ');
}
