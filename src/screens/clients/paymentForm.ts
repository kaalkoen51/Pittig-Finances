/** Pure logic for the "Record payment" sheet and the client history timeline. */
import { saleTotal } from '../../domain/calc';
import { newId } from '../../domain/ids';
import type { AppData, Cents, Id, ISODate, Payment, PaymentMethod, Sale, SalePaymentInfo } from '../../domain/types';

export interface PaymentFormState {
  clientId?: Id;
  /** Always positive in the form; `refund` makes it negative. */
  amount: Cents | null;
  date: ISODate | undefined;
  saleId?: Id;
  method: PaymentMethod;
  refund: boolean;
  notes: string;
}

/**
 * Suggested amount: the chosen sale's open amount, else the client's open balance (if > 0).
 * Returns null when there is nothing sensible to suggest.
 */
export function suggestedAmount(opts: { saleId?: Id; sales: Map<Id, SalePaymentInfo>; outstanding?: Cents }): Cents | null {
  if (opts.saleId) {
    const open = opts.sales.get(opts.saleId)?.open ?? 0;
    if (open > 0) return open;
  }
  return opts.outstanding && opts.outstanding > 0 ? opts.outstanding : null;
}

export function paymentToForm(p: Payment): PaymentFormState {
  return {
    clientId: p.clientId,
    amount: Math.abs(p.amount),
    date: p.date,
    ...(p.saleId ? { saleId: p.saleId } : {}),
    method: p.method ?? 'bank',
    refund: p.amount < 0,
    notes: p.notes ?? '',
  };
}

export type PaymentFormErrors = Partial<Record<'clientId' | 'amount' | 'date', 'required' | 'invalidAmount'>>;

export function validatePaymentForm(f: PaymentFormState): PaymentFormErrors {
  const e: PaymentFormErrors = {};
  if (!f.clientId) e.clientId = 'required';
  if (f.amount === null) e.amount = 'required';
  else if (f.amount === 0) e.amount = 'invalidAmount';
  if (!f.date) e.date = 'required';
  return e;
}

export function buildPayment(f: PaymentFormState, existing?: Payment): Payment {
  const notes = f.notes.trim();
  const amt = Math.abs(f.amount ?? 0);
  return {
    id: existing?.id ?? newId(),
    date: f.date!,
    clientId: f.clientId!,
    ...(f.saleId ? { saleId: f.saleId } : {}),
    amount: f.refund ? -amt : amt,
    method: f.method,
    ...(notes ? { notes } : {}),
  };
}

// ---------- Client history ----------

export type HistoryEntry =
  | { kind: 'sale'; date: ISODate; id: Id; sale: Sale; amount: Cents; balance: Cents }
  | { kind: 'payment'; date: ISODate; id: Id; payment: Payment; amount: Cents; balance: Cents };

/**
 * All sales and payments of a client with the running balance (what the client still owes after
 * that entry). Computed oldest first (same day: sales before payments), returned newest first.
 */
export function clientHistory(data: Pick<AppData, 'sales' | 'payments'>, clientId: Id): HistoryEntry[] {
  type Raw = { kind: 'sale'; date: ISODate; id: Id; sale: Sale; amount: Cents } | { kind: 'payment'; date: ISODate; id: Id; payment: Payment; amount: Cents };
  const raw: Raw[] = [];
  for (const s of data.sales) if (s.clientId === clientId) raw.push({ kind: 'sale', date: s.date, id: s.id, sale: s, amount: saleTotal(s) });
  for (const p of data.payments) if (p.clientId === clientId) raw.push({ kind: 'payment', date: p.date, id: p.id, payment: p, amount: p.amount });
  const idx = new Map(raw.map((r, i) => [r, i]));
  raw.sort((a, b) => (a.date !== b.date ? (a.date < b.date ? -1 : 1) : a.kind !== b.kind ? (a.kind === 'sale' ? -1 : 1) : idx.get(a)! - idx.get(b)!));
  let balance = 0;
  const out: HistoryEntry[] = raw.map((r) => {
    balance += r.kind === 'sale' ? r.amount : -r.amount;
    return { ...r, balance } as HistoryEntry;
  });
  return out.reverse();
}
