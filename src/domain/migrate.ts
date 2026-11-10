/**
 * Data versioning, defaults, migration and validation.
 *
 * `parseAppData(text)` is the single entry point used by every Storage implementation:
 * JSON.parse → migrate to CURRENT_VERSION → validate. It never throws.
 */
import { isISODate } from './dates';
import { newId } from './ids';
import type { AppData, Category, Language, Settings } from './types';

export const CURRENT_VERSION = 1;

const DEFAULT_CATEGORY_NAMES: Record<Language, string[]> = {
  nl: ['Ingrediënten', 'Verpakking', 'Etiketten & drukwerk', 'Apparatuur', 'Transport', 'Marktkosten', 'Marketing', 'Overig'],
  en: ['Ingredients', 'Packaging', 'Labels & print', 'Equipment', 'Transport', 'Market fees', 'Marketing', 'Other'],
};
const DEFAULT_CATEGORY_COLORS = ['#D9822B', '#8E6C4A', '#B05BC4', '#5B7BD5', '#2F9E8F', '#D4A72C', '#D2463A', '#8E8E93'];

export function defaultCategories(lang: Language = 'nl'): Category[] {
  return DEFAULT_CATEGORY_NAMES[lang].map((name, i) => ({
    id: newId(),
    name,
    color: DEFAULT_CATEGORY_COLORS[i] ?? '#8E8E93',
    archived: false,
  }));
}

export function defaultSettings(lang: Language = 'nl'): Settings {
  return { businessName: '', language: lang, firstRunDone: false };
}

/** A fresh dataset (first run): no records, default categories. */
export function emptyData(lang: Language = 'nl'): AppData {
  return {
    version: CURRENT_VERSION,
    clients: [],
    suppliers: [],
    products: [],
    batches: [],
    sales: [],
    payments: [],
    expenses: [],
    categories: defaultCategories(lang),
    importRows: [],
    settings: defaultSettings(lang),
  };
}

export type ParseResult =
  | { ok: true; data: AppData; /** Set when the input had an older version. */ migratedFrom?: number }
  | { ok: false; error: string };

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Migration steps: MIGRATIONS[n] upgrades version n → n+1.
 * Version 0 = pre-release drafts without `version` (had settings.currency, Category.kind, no archived flags).
 */
const MIGRATIONS: Record<number, (d: Obj) => Obj> = {
  0: (d) => {
    const arr = (k: string): Obj[] => (Array.isArray(d[k]) ? (d[k] as unknown[]).filter(isObj) : []);
    const withArchived = (list: Obj[]) => list.map((x) => ({ ...x, archived: x.archived === true }));
    const settingsIn = isObj(d.settings) ? d.settings : {};
    const { currency: _currency, ...settingsRest } = settingsIn;
    const categories = arr('categories')
      .filter((c) => c.kind !== 'income')
      .map(({ kind: _kind, ...c }) => ({ color: '#8E8E93', ...c, archived: c.archived === true }));
    return {
      ...d,
      version: 1,
      clients: withArchived(arr('clients')),
      suppliers: withArchived(arr('suppliers')),
      products: withArchived(arr('products')),
      batches: arr('batches').map((b) => ({ ...b, closed: b.closed === true })),
      sales: arr('sales'),
      payments: arr('payments'),
      expenses: arr('expenses').map((e) => ({ ...e, paidOn: typeof e.paidOn === 'string' ? e.paidOn : null })),
      categories,
      importRows: arr('importRows'),
      settings: { ...defaultSettings(), ...settingsRest },
    };
  },
};

/** Upgrade any older shape to CURRENT_VERSION. Does not validate. */
export function migrate(raw: unknown): { data: unknown; migratedFrom?: number } | { error: string } {
  if (!isObj(raw)) return { error: 'Data is not an object' };
  let version = raw.version === undefined ? 0 : raw.version;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 0) return { error: `Invalid version: ${String(raw.version)}` };
  if (version > CURRENT_VERSION) return { error: `Data is from a newer app version (${version}); please update the app` };
  const from = version;
  let d: Obj = raw;
  while (version < CURRENT_VERSION) {
    const step = MIGRATIONS[version];
    if (!step) return { error: `No migration from version ${version}` };
    d = step(d);
    version++;
    d.version = version;
  }
  return from < CURRENT_VERSION ? { data: d, migratedFrom: from } : { data: d };
}

// ---------- validation ----------

class V {
  errors: string[] = [];
  fail(path: string, msg: string) {
    if (this.errors.length < 20) this.errors.push(`${path}: ${msg}`);
  }
  str(o: Obj, k: string, path: string, opt = false) {
    const v = o[k];
    if (v === undefined && opt) return;
    if (typeof v !== 'string') this.fail(`${path}.${k}`, 'expected text');
  }
  id(o: Obj, k: string, path: string, opt = false) {
    const v = o[k];
    if (v === undefined && opt) return;
    if (typeof v !== 'string' || v.length === 0) this.fail(`${path}.${k}`, 'expected id');
  }
  date(o: Obj, k: string, path: string, opt = false) {
    const v = o[k];
    if (v === undefined && opt) return;
    if (!isISODate(v)) this.fail(`${path}.${k}`, 'expected date YYYY-MM-DD');
  }
  cents(o: Obj, k: string, path: string) {
    const v = o[k];
    if (typeof v !== 'number' || !Number.isSafeInteger(v)) this.fail(`${path}.${k}`, 'expected integer cents');
  }
  num(o: Obj, k: string, path: string) {
    const v = o[k];
    if (typeof v !== 'number' || !Number.isFinite(v)) this.fail(`${path}.${k}`, 'expected number');
  }
  bool(o: Obj, k: string, path: string) {
    if (typeof o[k] !== 'boolean') this.fail(`${path}.${k}`, 'expected true/false');
  }
  oneOf(o: Obj, k: string, path: string, values: readonly unknown[], opt = false) {
    const v = o[k];
    if (v === undefined && opt) return;
    if (!values.includes(v)) this.fail(`${path}.${k}`, `expected one of ${values.join(', ')}`);
  }
  list(d: Obj, k: string, each: (o: Obj, path: string) => void) {
    const v = d[k];
    if (!Array.isArray(v)) {
      this.fail(k, 'expected a list');
      return;
    }
    v.forEach((item, i) => {
      const path = `${k}[${i}]`;
      if (!isObj(item)) this.fail(path, 'expected an object');
      else {
        this.id(item, 'id', path);
        each(item, path);
      }
    });
  }
}

/** Structural validation of a CURRENT_VERSION dataset. Extra unknown fields are allowed. */
export function validate(raw: unknown): ParseResult {
  if (!isObj(raw)) return { ok: false, error: 'Data is not an object' };
  const v = new V();
  if (raw.version !== CURRENT_VERSION) v.fail('version', `expected ${CURRENT_VERSION}`);
  const party = (o: Obj, p: string) => {
    v.str(o, 'name', p);
    v.str(o, 'email', p, true);
    v.str(o, 'phone', p, true);
    v.str(o, 'notes', p, true);
    v.bool(o, 'archived', p);
  };
  v.list(raw, 'clients', party);
  v.list(raw, 'suppliers', party);
  v.list(raw, 'products', (o, p) => {
    v.str(o, 'name', p);
    v.str(o, 'unit', p);
    v.cents(o, 'defaultPrice', p);
    v.bool(o, 'archived', p);
  });
  v.list(raw, 'batches', (o, p) => {
    v.id(o, 'productId', p);
    v.str(o, 'code', p);
    v.date(o, 'producedOn', p);
    v.num(o, 'quantity', p);
    v.str(o, 'notes', p, true);
    v.bool(o, 'closed', p);
  });
  v.list(raw, 'sales', (o, p) => {
    v.date(o, 'date', p);
    v.id(o, 'clientId', p, true);
    v.date(o, 'dueDate', p, true);
    v.str(o, 'notes', p, true);
    if (!Array.isArray(o.items)) v.fail(`${p}.items`, 'expected a list');
    else
      o.items.forEach((it, i) => {
        const ip = `${p}.items[${i}]`;
        if (!isObj(it)) return v.fail(ip, 'expected an object');
        v.id(it, 'productId', ip);
        v.id(it, 'batchId', ip, true);
        v.num(it, 'quantity', ip);
        v.cents(it, 'unitPrice', ip);
      });
  });
  v.list(raw, 'payments', (o, p) => {
    v.date(o, 'date', p);
    v.id(o, 'clientId', p);
    v.id(o, 'saleId', p, true);
    v.cents(o, 'amount', p);
    v.oneOf(o, 'method', p, ['bank', 'cash', 'card', 'other'], true);
    v.str(o, 'notes', p, true);
  });
  v.list(raw, 'expenses', (o, p) => {
    v.date(o, 'date', p);
    v.id(o, 'supplierId', p, true);
    v.id(o, 'categoryId', p);
    v.id(o, 'batchId', p, true);
    v.str(o, 'description', p);
    v.cents(o, 'amount', p);
    if (o.paidOn !== null) v.date(o, 'paidOn', p);
    v.date(o, 'dueDate', p, true);
  });
  v.list(raw, 'categories', (o, p) => {
    v.str(o, 'name', p);
    v.str(o, 'color', p);
    v.bool(o, 'archived', p);
  });
  v.list(raw, 'importRows', (o, p) => {
    v.date(o, 'date', p);
    v.str(o, 'description', p);
    v.cents(o, 'amount', p);
    v.str(o, 'source', p);
    v.str(o, 'fingerprint', p);
    v.str(o, 'counterparty', p, true);
    v.oneOf(o, 'status', p, ['todo', 'done', 'ignored']);
    v.id(o, 'linkedId', p, true);
    v.oneOf(o, 'linkedCollection', p, ['payments', 'expenses', 'sales'], true);
    v.str(o, 'importedAt', p);
  });
  if (!isObj(raw.settings)) v.fail('settings', 'expected an object');
  else {
    const s = raw.settings;
    v.str(s, 'businessName', 'settings');
    v.oneOf(s, 'language', 'settings', ['nl', 'en']);
    v.bool(s, 'firstRunDone', 'settings');
    if (s.lastUsed !== undefined && !isObj(s.lastUsed)) v.fail('settings.lastUsed', 'expected an object');
  }
  if (v.errors.length) return { ok: false, error: v.errors.join('; ') };
  return { ok: true, data: raw as unknown as AppData };
}

/** Migrate + validate an already-parsed value. */
export function upgradeAppData(raw: unknown): ParseResult {
  const m = migrate(raw);
  if ('error' in m) return { ok: false, error: m.error };
  const r = validate(m.data);
  if (!r.ok) return r;
  return m.migratedFrom !== undefined ? { ok: true, data: r.data, migratedFrom: m.migratedFrom } : r;
}

/** JSON text → validated AppData. Never throws. */
export function parseAppData(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { ok: false, error: `Not valid JSON: ${(e as Error).message}` };
  }
  return upgradeAppData(raw);
}

/** Canonical serialisation used for the data file and backups. */
export function serializeAppData(data: AppData): string {
  return JSON.stringify(data, null, 2);
}
