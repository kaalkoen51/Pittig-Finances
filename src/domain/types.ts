/**
 * Pittig Finances – domain types. FROZEN CONTRACT: change only via the orchestrator.
 *
 * Conventions
 * - Money is always an integer number of euro cents (`Cents`). Never floats.
 *   Amounts may be negative for refunds (Payment.amount, Expense.amount).
 * - Dates are local calendar dates as `YYYY-MM-DD` strings (`ISODate`).
 * - Timestamps (e.g. backup times) are full ISO-8601 strings (`ISODateTime`).
 * - IDs are UUID strings (see ids.ts `newId()`).
 * - Optional fields are omitted (not set to undefined/"") when empty.
 * - Currency is always EUR. No VAT in v1.
 */

export type Cents = number;
export type ISODate = string; // 'YYYY-MM-DD'
export type ISODateTime = string; // new Date().toISOString()
export type Id = string;
export type Language = 'nl' | 'en';
export type Theme = 'system' | 'light' | 'dark';

export interface Client {
  id: Id;
  name: string;
  email?: string;
  phone?: string;
  notes?: string;
  archived: boolean;
}

/** A creditor: someone the business buys from and may owe money to. */
export interface Supplier {
  id: Id;
  name: string;
  email?: string;
  phone?: string;
  notes?: string;
  archived: boolean;
}

export interface Product {
  id: Id;
  name: string;
  /** Unit label shown next to quantities, e.g. "pot", "fles", "jar". */
  unit: string;
  /** Plural of `unit` ("flessen"). Omitted = guessed from `unit` (see i18n/define autoPluralUnit). */
  unitPlural?: string;
  /** Default sale price per unit, in cents. */
  defaultPrice: Cents;
  archived: boolean;
}

/** A production run of one product. */
export interface Batch {
  id: Id;
  productId: Id;
  /** Human code, e.g. "2026-03" or "B12". */
  code: string;
  producedOn: ISODate;
  /** Units produced. Used for cost per unit and units left. */
  quantity: number;
  notes?: string;
  /** Closed batches are not preselected in the sale form. `archive('batches', …)` toggles this. */
  closed: boolean;
}

export interface SaleItem {
  productId: Id;
  batchId?: Id;
  quantity: number;
  /** Price per unit in cents. Line total = round(quantity * unitPrice). */
  unitPrice: Cents;
}

export interface Sale {
  id: Id;
  date: ISODate;
  /** Missing = walk-in / market sale: always counts as paid and received on `date`. */
  clientId?: Id;
  items: SaleItem[];
  notes?: string;
  dueDate?: ISODate;
}

export type PaymentMethod = 'bank' | 'cash' | 'card' | 'other';

/** Money in from a client. */
export interface Payment {
  id: Id;
  date: ISODate;
  clientId: Id;
  /** If set, applied to this sale first; otherwise allocated FIFO over the client's sales. */
  saleId?: Id;
  /** Cents; negative = refund to the client. */
  amount: Cents;
  method?: PaymentMethod;
  notes?: string;
  /**
   * true = created by the sale form's "Paid already" toggle. Only such payments are changed or
   * removed when the sale is edited; real payments (bank, cash, import) are never rewritten.
   * Older data has no flag: see saleForm.ts `autoPaymentFor` for the legacy rule.
   */
  auto?: boolean;
}

/** Money out. Unpaid expenses (paidOn === null) are what the business owes. */
export interface Expense {
  id: Id;
  date: ISODate;
  supplierId?: Id;
  categoryId: Id;
  /** Linked expenses count as batch costs; unlinked ones are "general costs". */
  batchId?: Id;
  description: string;
  /** Cents; negative = refund from a supplier. */
  amount: Cents;
  /** Date it was paid, or null when still owed. */
  paidOn: ISODate | null;
  dueDate?: ISODate;
}

/** Expense category (all categories are expense categories). */
export interface Category {
  id: Id;
  name: string;
  /** CSS colour, e.g. '#D9822B'. */
  color: string;
  archived: boolean;
}

export type ImportRowStatus = 'todo' | 'done' | 'ignored';

/** A row from a bank/Excel/CSV import waiting to be sorted by hand ("To sort"). */
export interface ImportRow {
  id: Id;
  date: ISODate;
  description: string;
  /** Cents; positive = money in, negative = money out. */
  amount: Cents;
  /** Where it came from, e.g. the file name "ING-2026-03.csv". */
  source: string;
  /**
   * `date|amountCents|normalized description` (+ `#n` for the n-th identical row in one file) – see
   * importing.ts. Used to skip duplicates across overlapping bank downloads. Rows imported by older
   * versions still have `|source` appended; dedupe ignores it.
   */
  fingerprint: string;
  /** Counterparty name as given by the bank, if any. */
  counterparty?: string;
  status: ImportRowStatus;
  /** What this row was turned into / matched with (status 'done'). */
  linkedId?: Id;
  linkedCollection?: 'payments' | 'expenses' | 'sales';
  /** true when the linked payment/expense was created from this row (not matched to an existing one). */
  linkCreated?: boolean;
  importedAt: ISODateTime;
}

export interface Settings {
  businessName: string;
  language: Language;
  /** Colour theme; missing = 'system' (follow the device). */
  theme?: Theme;
  firstRunDone: boolean;
  /** Remembered choices for sensible form defaults. */
  lastUsed?: {
    clientId?: Id;
    productId?: Id;
    supplierId?: Id;
    categoryId?: Id;
  };
}

export interface AppData {
  version: number;
  clients: Client[];
  suppliers: Supplier[];
  products: Product[];
  batches: Batch[];
  sales: Sale[];
  payments: Payment[];
  expenses: Expense[];
  categories: Category[];
  importRows: ImportRow[];
  settings: Settings;
}

/** Collections that hold entities with an `id`. */
export interface EntityMap {
  clients: Client;
  suppliers: Supplier;
  products: Product;
  batches: Batch;
  sales: Sale;
  payments: Payment;
  expenses: Expense;
  categories: Category;
  importRows: ImportRow;
}
export type CollectionName = keyof EntityMap;
export type EntityOf<C extends CollectionName> = EntityMap[C];

export const COLLECTIONS: readonly CollectionName[] = [
  'clients',
  'suppliers',
  'products',
  'batches',
  'sales',
  'payments',
  'expenses',
  'categories',
  'importRows',
] as const;

/** Collections that can be archived instead of deleted. For 'batches' archive sets `closed`. */
export type ArchivableCollection = 'clients' | 'suppliers' | 'products' | 'categories' | 'batches';
export const ARCHIVABLE: readonly ArchivableCollection[] = [
  'clients',
  'suppliers',
  'products',
  'categories',
  'batches',
] as const;

// ---- Derived (calc.ts) ----

export type SaleStatus = 'paid' | 'partial' | 'open';

export interface SalePaymentInfo {
  saleId: Id;
  total: Cents;
  paid: Cents;
  /** total - paid, never below 0. */
  open: Cents;
  status: SaleStatus;
  /** open > 0 and dueDate < today. */
  overdue: boolean;
}

export interface ClientSummary {
  clientId: Id;
  /** Σ sale totals. */
  sold: Cents;
  /** Σ payments (refunds subtract). */
  received: Cents;
  /** sold - received. Negative = client has credit. */
  outstanding: Cents;
  saleCount: number;
  openSaleCount: number;
  lastActivity?: ISODate;
}

export interface BatchStats {
  batchId: Id;
  productId: Id;
  quantity: number;
  unitsSold: number;
  /** quantity - unitsSold (can go negative if over-sold). */
  unitsLeft: number;
  revenue: Cents;
  /** Σ expenses linked to the batch. */
  costs: Cents;
  profit: Cents;
  /** round(costs / quantity); null when quantity is 0. */
  costPerUnit: Cents | null;
}

export interface ProductStats {
  productId: Id;
  unitsSold: number;
  revenue: Cents;
  /** Costs of all batches of this product. */
  costs: Cents;
  profit: Cents;
  batchCount: number;
}

export interface SupplierOwed {
  /** null = unpaid expenses without supplier. */
  supplierId: Id | null;
  total: Cents;
  overdueTotal: Cents;
  overdue: boolean;
  expenses: Expense[];
}

export interface DateRange {
  /** Inclusive; undefined = open start. */
  from?: ISODate;
  /** Inclusive; undefined = open end. */
  to?: ISODate;
}

export type PeriodKey = 'thisMonth' | 'lastMonth' | 'thisYear' | 'all';

export interface PeriodSummary {
  range: DateRange;
  /** Cash in: payments dated in range + clientless sales dated in range. */
  moneyIn: Cents;
  /** Cash out: expenses with paidOn in range. */
  moneyOut: Cents;
  /** moneyIn - moneyOut. */
  result: Cents;
  /** Sales booked (by sale date), paid or not. */
  sold: Cents;
  /** Expenses booked (by expense date), paid or not. */
  costs: Cents;
  /** sold - costs. */
  profit: Cents;
  saleCount: number;
  expenseCount: number;
}
