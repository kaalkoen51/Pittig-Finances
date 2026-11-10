/**
 * App state: React context + reducer. FROZEN API – feature agents use the hooks, never the reducer.
 *
 *   useData()      → AppData (current, immutable snapshot)
 *   useDerived()   → memoised calc results + lookup maps (see Derived)
 *   useActions()   → { upsert, upsertMany, remove, archive, updateSettings, replaceAll, isReferenced, flush }
 *   useAppStatus() → { status: 'loading'|'ready'|'recovery', lastSavedAt, saveError, recoveryError }
 *   useStorage()   → the Storage (backups, export, info …)
 *
 * Autosave: 300 ms after the last change; flushed on window close / page hide.
 * Recovery mode (stored data corrupt): nothing is ever saved until replaceAll() succeeds.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from 'react';
import {
  allocatePayments,
  batchStats,
  clientSummaries,
  generalCosts,
  hasUserContent,
  isReferenced as isReferencedCalc,
  periodSummary,
  PROTECTED_COLLECTIONS,
  productStats,
  supplierOwed,
  totalOwedToYou,
  totalYouOwe,
} from '../domain/calc';
import { today as todayFn } from '../domain/dates';
import { emptyData, validate } from '../domain/migrate';
import type {
  AppData,
  ArchivableCollection,
  Batch,
  BatchStats,
  Category,
  Cents,
  Client,
  ClientSummary,
  CollectionName,
  DateRange,
  EntityOf,
  Id,
  ISODate,
  PeriodSummary,
  Product,
  ProductStats,
  Sale,
  SalePaymentInfo,
  Settings,
  Supplier,
  SupplierOwed,
} from '../domain/types';
import { getStorage } from '../storage';
import type { BackupReason, Storage } from '../storage/types';

export const AUTOSAVE_MS = 300;

export type StoreStatus = 'loading' | 'ready' | 'recovery';

interface State {
  status: StoreStatus;
  data: AppData;
  /** Increments on every data change; used to schedule autosave. */
  rev: number;
  /** rev that was last written successfully. */
  savedRev: number;
  lastSavedAt?: string;
  saveError?: string;
  recoveryError?: string;
  migratedFrom?: number;
}

type Action =
  | { type: 'loaded'; data: AppData; dirty: boolean; migratedFrom?: number }
  | { type: 'corrupt'; error: string }
  | { type: 'upsert'; collection: CollectionName; items: { id: Id }[] }
  | { type: 'remove'; collection: CollectionName; id: Id }
  | { type: 'archive'; collection: ArchivableCollection; id: Id; archived: boolean }
  | { type: 'settings'; patch: Partial<Settings> }
  | { type: 'replace'; data: AppData }
  | { type: 'saved'; rev: number; at: string }
  | { type: 'saveError'; error: string };

function withData(s: State, data: AppData): State {
  return { ...s, data, rev: s.rev + 1 };
}

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'loaded':
      return { ...s, status: 'ready', data: a.data, rev: a.dirty ? 1 : 0, savedRev: 0, migratedFrom: a.migratedFrom };
    case 'corrupt':
      return { ...s, status: 'recovery', recoveryError: a.error };
    case 'replace':
      return { ...withData(s, a.data), status: 'ready', recoveryError: undefined };
    case 'saved':
      return { ...s, savedRev: Math.max(s.savedRev, a.rev), lastSavedAt: a.at, saveError: undefined };
    case 'saveError':
      return { ...s, saveError: a.error };
  }
  if (s.status !== 'ready') return s; // no edits while loading / in recovery
  const d = s.data;
  switch (a.type) {
    case 'upsert': {
      const list = d[a.collection] as { id: Id }[];
      const next = [...list];
      const index = new Map(next.map((x, i) => [x.id, i]));
      for (const item of a.items) {
        const i = index.get(item.id);
        if (i === undefined) {
          index.set(item.id, next.length);
          next.push(item);
        } else next[i] = item;
      }
      return withData(s, { ...d, [a.collection]: next });
    }
    case 'remove': {
      const list = d[a.collection] as { id: Id }[];
      if (!list.some((x) => x.id === a.id)) return s;
      let next: AppData = { ...d, [a.collection]: list.filter((x) => x.id !== a.id) };
      if (a.collection === 'sales') {
        next.payments = next.payments.map((p) => (p.saleId === a.id ? stripSaleId(p) : p));
      }
      if (a.collection === 'sales' || a.collection === 'payments' || a.collection === 'expenses') {
        if (next.importRows.some((r) => r.linkedId === a.id)) {
          next = {
            ...next,
            importRows: next.importRows.map((r) => {
              if (r.linkedId !== a.id) return r;
              const { linkedId: _l, linkedCollection: _c, ...rest } = r;
              return { ...rest, status: 'todo' as const };
            }),
          };
        }
      }
      return withData(s, next);
    }
    case 'archive': {
      const field = a.collection === 'batches' ? 'closed' : 'archived';
      const list = d[a.collection] as unknown as ({ id: Id } & Record<string, unknown>)[];
      return withData(s, { ...d, [a.collection]: list.map((x) => (x.id === a.id ? { ...x, [field]: a.archived } : x)) });
    }
    case 'settings': {
      const lastUsed = a.patch.lastUsed ? { ...d.settings.lastUsed, ...a.patch.lastUsed } : d.settings.lastUsed;
      const settings: Settings = { ...d.settings, ...a.patch };
      if (lastUsed) settings.lastUsed = lastUsed;
      return withData(s, { ...d, settings });
    }
  }
}

function stripSaleId<T extends { saleId?: Id }>(p: T): T {
  const { saleId: _s, ...rest } = p;
  return rest as T;
}

function isCompletelyEmpty(d: AppData): boolean {
  return !hasUserContent(d) && d.categories.length === 0;
}

// ---------- Derived ----------

export interface Derived {
  today: ISODate;
  /** Payment status per sale id. */
  sales: Map<Id, SalePaymentInfo>;
  /** Totals per client id. */
  clients: Map<Id, ClientSummary>;
  /** Stats per batch id. */
  batches: Map<Id, BatchStats>;
  /** Stats per product id. */
  products: Map<Id, ProductStats>;
  /** Unpaid expenses per supplier, largest first. */
  supplierOwed: SupplierOwed[];
  /** "Owed to you" (debtors). */
  owedToYou: Cents;
  /** "You owe" (creditors). */
  youOwe: Cents;
  /** All-time general costs (expenses without batch). */
  generalCosts: Cents;
  /** Number of import rows with status 'todo'. */
  todoImportCount: number;
  /** Period summary for any range (not memoised per range – cheap). */
  period(range: DateRange): PeriodSummary;
  // Lookup maps by id (include archived items)
  clientById: Map<Id, Client>;
  supplierById: Map<Id, Supplier>;
  productById: Map<Id, Product>;
  batchById: Map<Id, Batch>;
  categoryById: Map<Id, Category>;
  saleById: Map<Id, Sale>;
}

export function computeDerived(data: AppData, today: ISODate = todayFn()): Derived {
  const sales = allocatePayments(data, today);
  const batches = batchStats(data);
  const byId = <T extends { id: Id }>(list: T[]) => new Map(list.map((x) => [x.id, x]));
  return {
    today,
    sales,
    clients: clientSummaries(data, today, sales),
    batches,
    products: productStats(data, batches),
    supplierOwed: supplierOwed(data, today),
    owedToYou: totalOwedToYou(data, today),
    youOwe: totalYouOwe(data),
    generalCosts: generalCosts(data),
    todoImportCount: data.importRows.filter((r) => r.status === 'todo').length,
    period: (range) => periodSummary(data, range),
    clientById: byId(data.clients),
    supplierById: byId(data.suppliers),
    productById: byId(data.products),
    batchById: byId(data.batches),
    categoryById: byId(data.categories),
    saleById: byId(data.sales),
  };
}

// ---------- Contexts ----------

export interface Actions {
  /** Insert or replace (by id). */
  upsert<C extends CollectionName>(collection: C, item: EntityOf<C>): void;
  /** Insert or replace many in one change (one autosave). */
  upsertMany<C extends CollectionName>(collection: C, items: EntityOf<C>[]): void;
  /**
   * Delete by id. Returns false (and does nothing) for clients/suppliers/products/batches/categories
   * that are still referenced – offer archive() instead. Removing a sale clears `saleId` on its
   * payments; removing a sale/payment/expense resets linked import rows to 'todo'.
   */
  remove(collection: CollectionName, id: Id): boolean;
  /** Archive / unarchive. For 'batches' this sets `closed`. */
  archive(collection: ArchivableCollection, id: Id, archived: boolean): void;
  /** Shallow-merge into settings (`lastUsed` is merged one level deeper). */
  updateSettings(patch: Partial<Settings>): void;
  /**
   * Replace the whole dataset (restore backup, import backup file, load demo data).
   * Makes a backup of the current stored data first (reason default 'pre-replace'), validates
   * `data`, saves immediately and leaves recovery mode. Rejects if backup or validation fails.
   */
  replaceAll(data: AppData, opts?: { backupReason?: BackupReason | false }): Promise<void>;
  /** True if something references this item (then remove() would refuse for protected collections). */
  isReferenced(collection: CollectionName, id: Id): boolean;
  /** Write pending changes now. */
  flush(): Promise<void>;
}

export interface AppStatus {
  status: StoreStatus;
  lastSavedAt?: string;
  saveError?: string;
  recoveryError?: string;
  /** Set when the stored data was upgraded from an older version this session. */
  migratedFrom?: number;
  /** True while there are unsaved changes. */
  dirty: boolean;
}

const DataCtx = createContext<AppData | null>(null);
const ActionsCtx = createContext<Actions | null>(null);
const StatusCtx = createContext<AppStatus | null>(null);
const StorageCtx = createContext<Storage | null>(null);

export interface StoreProviderProps {
  children: ReactNode;
  /** Defaults to getStorage(). Tests pass a MemoryStorage. */
  storage?: Storage;
  /** Skip loading and start ready with this data (tests / storybook-like usage). Still autosaves. */
  initialData?: AppData;
}

export function StoreProvider({ children, storage: storageProp, initialData }: StoreProviderProps) {
  const storage = useMemo(() => storageProp ?? getStorage(), [storageProp]);
  const [state, dispatch] = useReducer(reducer, undefined, (): State => ({
    status: initialData ? 'ready' : 'loading',
    data: initialData ?? emptyData(),
    rev: 0,
    savedRev: 0,
  }));

  const stateRef = useRef(state);
  stateRef.current = state;
  const loadedWithContent = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---- load ----
  useEffect(() => {
    if (initialData) return;
    let cancelled = false;
    storage
      .load()
      .then((r) => {
        if (cancelled) return;
        if (r.status === 'ok') {
          loadedWithContent.current = !isCompletelyEmpty(r.data);
          dispatch({ type: 'loaded', data: r.data, dirty: false, migratedFrom: r.migratedFrom });
        } else if (r.status === 'empty') {
          // First run: persist the seeded categories right away so their ids are stable.
          dispatch({ type: 'loaded', data: emptyData(), dirty: true });
        } else {
          dispatch({ type: 'corrupt', error: r.error });
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) dispatch({ type: 'corrupt', error: e instanceof Error ? e.message : String(e) });
      });
    return () => {
      cancelled = true;
    };
  }, [storage, initialData]);

  // ---- save ----
  const saveNow = useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const s = stateRef.current;
    if (s.status !== 'ready' || s.rev === s.savedRev) return storage.flush();
    if (loadedWithContent.current && isCompletelyEmpty(s.data)) {
      dispatch({ type: 'saveError', error: 'Refusing to overwrite stored data with an empty dataset' });
      return;
    }
    const rev = s.rev;
    try {
      await storage.save(s.data);
      await storage.flush();
      if (!isCompletelyEmpty(s.data)) loadedWithContent.current = true;
      dispatch({ type: 'saved', rev, at: new Date().toISOString() });
    } catch (e) {
      dispatch({ type: 'saveError', error: e instanceof Error ? e.message : String(e) });
    }
  }, [storage]);

  useEffect(() => {
    if (state.status !== 'ready' || state.rev === state.savedRev) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      void saveNow();
    }, AUTOSAVE_MS);
  }, [state.rev, state.savedRev, state.status, saveNow]);

  useEffect(() => {
    const off = storage.onBeforeClose(() => saveNow());
    const onHide = () => {
      if (document.visibilityState === 'hidden') void saveNow();
    };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      off();
      document.removeEventListener('visibilitychange', onHide);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [storage, saveNow]);

  // ---- actions ----
  const actions = useMemo<Actions>(
    () => ({
      upsert(collection, item) {
        dispatch({ type: 'upsert', collection, items: [item] });
      },
      upsertMany(collection, items) {
        if (items.length) dispatch({ type: 'upsert', collection, items });
      },
      remove(collection, id) {
        const d = stateRef.current.data;
        if (PROTECTED_COLLECTIONS.includes(collection) && isReferencedCalc(d, collection, id)) return false;
        dispatch({ type: 'remove', collection, id });
        return true;
      },
      archive(collection, id, archived) {
        dispatch({ type: 'archive', collection, id, archived });
      },
      updateSettings(patch) {
        dispatch({ type: 'settings', patch });
      },
      async replaceAll(data, opts = {}) {
        const v = validate(data);
        if (!v.ok) throw new Error(`Invalid data: ${v.error}`);
        const reason = opts.backupReason ?? 'pre-replace';
        if (reason !== false) await storage.backupNow(reason);
        await storage.flush();
        if (timer.current) clearTimeout(timer.current);
        await storage.save(data);
        await storage.flush();
        loadedWithContent.current = !isCompletelyEmpty(data);
        dispatch({ type: 'replace', data });
        // Mark the replaced revision as saved.
        dispatch({ type: 'saved', rev: stateRef.current.rev + 1, at: new Date().toISOString() });
      },
      isReferenced(collection, id) {
        return isReferencedCalc(stateRef.current.data, collection, id);
      },
      flush: saveNow,
    }),
    [storage, saveNow],
  );

  const status = useMemo<AppStatus>(
    () => ({
      status: state.status,
      lastSavedAt: state.lastSavedAt,
      saveError: state.saveError,
      recoveryError: state.recoveryError,
      migratedFrom: state.migratedFrom,
      dirty: state.rev !== state.savedRev,
    }),
    [state.status, state.lastSavedAt, state.saveError, state.recoveryError, state.migratedFrom, state.rev, state.savedRev],
  );

  return (
    <StorageCtx.Provider value={storage}>
      <StatusCtx.Provider value={status}>
        <ActionsCtx.Provider value={actions}>
          <DataCtx.Provider value={state.data}>{children}</DataCtx.Provider>
        </ActionsCtx.Provider>
      </StatusCtx.Provider>
    </StorageCtx.Provider>
  );
}

function need<T>(v: T | null, name: string): T {
  if (v === null) throw new Error(`${name} must be used inside <StoreProvider>`);
  return v;
}

export function useData(): AppData {
  return need(useContext(DataCtx), 'useData');
}

/** Like useData() but returns null outside a StoreProvider (used by UI components and i18n). */
export function useOptionalData(): AppData | null {
  return useContext(DataCtx);
}

export function useActions(): Actions {
  return need(useContext(ActionsCtx), 'useActions');
}

export function useAppStatus(): AppStatus {
  return need(useContext(StatusCtx), 'useAppStatus');
}

export function useStorage(): Storage {
  return need(useContext(StorageCtx), 'useStorage');
}

/** Memoised derived numbers for the current data. `today` defaults to the real today. */
export function useDerived(today?: ISODate): Derived {
  const data = useData();
  const day = today ?? todayFn();
  return useMemo(() => computeDerived(data, day), [data, day]);
}
