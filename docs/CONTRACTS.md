# Contracts for feature agents

Read `docs/PLAN.md` (the "Revisions" section is binding) and then this. **Files marked FROZEN change only via the orchestrator.**

## Commands
`npm run dev` · `npm run typecheck` · `npm test` · `npm run build` · `npm run e2e` (Playwright vs `vite preview`; auto-uses Chromium in `/opt/pw-browsers`, never run `playwright install`) · `npm run build:electron` · `npm run electron:dev` · `npm run dist:win`.
Do **not** touch `package.json` / lockfile. All deps are installed (react 19, exceljs, electron 45, electron-builder, electron-updater, vite-plugin-pwa, vitest, testing-library + user-event + jest-dom, fake-indexeddb, playwright, esbuild, concurrently, wait-on).

## Folder ownership
| Owner | Folders |
|---|---|
| Foundation (frozen) | `src/domain/*`, `src/storage/{types,electronApi,idbStorage,memoryStorage,download,writeQueue,index}.ts`, `src/state`, `src/ui`, `src/i18n/{index,define,common}.ts`, `src/router.tsx`, `src/routes.ts`, `src/shell`, `src/App.tsx` |
| 2a | `src/screens/{overview,sales,clients}`, `src/i18n/{overview,sales,clients}.ts` |
| 2b | `src/screens/{expenses,suppliers,batches}`, `src/i18n/{expenses,suppliers,batches}.ts` |
| 2c | `src/excel/*`, `src/screens/{import,settings}`, `src/i18n/{import,settings}.ts` |
| 2d | `electron/*`, `src/storage/electronStorage.ts`, `scripts/build-electron.mjs`, `vite.config.ts` (add PWA plugin), `playwright.config.ts`, `.github/workflows`, `public/` (manifest/icons), electron-builder config (put it in `electron-builder.yml`, not package.json) |

Need a new common key, domain helper or UI component? Put it in your own folder (e.g. `src/screens/sales/components/`) or ask the orchestrator.
Every screen may add its own CSS file (`src/screens/<name>/<name>.css`, imported from its index.tsx), using tokens only, class prefix = screen name (e.g. `.sales-…`).

## Conventions
- **Money** = integer cents (`Cents`). Never floats. Parse user input with `parseMoney`, display with `<Amount>` or `useFormat().money`. Refunds = negative `Payment.amount` / `Expense.amount`.
- **Dates** = `'YYYY-MM-DD'` strings (`ISODate`), compare as strings. `today()` from `domain/dates`.
- **IDs** = `newId()` (UUID). Optional fields are *omitted* when empty, never `''`/`undefined` values.
- **Delete vs archive**: clients, suppliers, products, batches, categories: if `isReferenced(c,id)` show Archive instead of Delete (`remove` returns `false` and does nothing when referenced). `archive('batches', id, v)` sets `closed`.
- Payments with a client: `Payment.clientId` is required. "Paid already" on a sale with client ⇒ also upsert a `Payment {clientId, saleId, amount: total, date: sale.date}`. Clientless sales are always paid (no payment record).
- Remember defaults: `updateSettings({ lastUsed: { clientId } })` (merged).
- One primary button per view. Dutch default; every visible string through i18n.

## Domain (`src/domain`, import from `../../domain` or specific files)
`types.ts` FROZEN: `Client, Supplier, Product, Batch, Sale, SaleItem, Payment, PaymentMethod ('bank'|'cash'|'card'|'other'), Expense (paidOn: ISODate|null), Category, ImportRow (fingerprint, status 'todo'|'done'|'ignored', linkedId?, linkedCollection?, counterparty?, importedAt), Settings (businessName, language, firstRunDone, lastUsed?), AppData (version + 9 collections + settings)`, `CollectionName`, `EntityOf<C>`, `ArchivableCollection`, derived types below.

`calc.ts` (pure, all take `today` optional default real today):
```ts
lineTotal(item): Cents; saleTotal(sale): Cents
allocatePayments(data, today?): Map<saleId, SalePaymentInfo{total,paid,open,status:'paid'|'partial'|'open',overdue}>  // targeted first, then FIFO
clientSummaries(data, today?): Map<clientId, ClientSummary{sold,received,outstanding,saleCount,openSaleCount,lastActivity?}>
clientSummary(data, clientId, today?); totalOwedToYou(data, today?)  // Σ positive balances
openSalesForClient(data, clientId, today?): {sale, info}[]  // oldest first
paymentsForSale(data, saleId): Payment[]
batchStats(data): Map<batchId, BatchStats{quantity,unitsSold,unitsLeft,revenue,costs,profit,costPerUnit|null}>
productStats(data): Map<productId, ProductStats{unitsSold,revenue,costs,profit,batchCount}>
newestOpenBatch(data, productId): Batch|undefined   // sale form preselect
generalCosts(data, range?): Cents                    // expenses without batch
isExpenseOverdue(e, today?); supplierOwed(data, today?): SupplierOwed[]{supplierId|null,total,overdueTotal,overdue,expenses}; totalYouOwe(data)
periodSummary(data, range): PeriodSummary{moneyIn,moneyOut,result,sold,costs,profit,saleCount,expenseCount}
   // moneyIn = payments + clientless sales (by date); moneyOut = expenses by paidOn; sold/costs = booked by date
monthlySummaries(data): {month:'YYYY-MM', summary}[]  // newest first
isReferenced(data, collection, id); hasUserContent(data); PROTECTED_COLLECTIONS
```
`money.ts`: `formatMoney(c, lang, {signed?, compact?})` ("€ 1.234,56" / "€1,234.56", minus is "−"), `parseMoney(str|number) → Cents|null` (12,50 · 12.50 · 1.234,56 · 1,234.56 · € 12 · 12,- · (12,50) · -12), `centsToInput(c, lang)`, `eurosToCents(n)`, `formatNumber`, `sumCents`.
`dates.ts`: `today, toISODate, fromISODate, isISODate, addDays, addMonths, daysBetween, compareDates, monthKey, startOfMonth, endOfMonth, inRange(d, range), periodRange('thisMonth'|'lastMonth'|'thisYear'|'all', ref?), monthRange('YYYY-MM'), formatDate(d, lang, 'short'|'medium'|'long'|'month'), formatMonth, parseDate(str|Date)` (dd-mm-yyyy, d/m/yy, yyyy-mm-dd, yyyymmdd → ISO|null).
`importing.ts`: `normalizeDescription, importFingerprint({date,amount,description,source}), dedupeImportRows(existing, incoming) → {fresh, duplicates}`.
`migrate.ts`: `CURRENT_VERSION, emptyData(lang?), defaultCategories(lang?), parseAppData(text) → ParseResult, upgradeAppData(obj), validate(obj), serializeAppData(data)`.
`fixtures.ts`: `demoData(ref = today())` – stable ids `demo-…`; Settings "Load demo data" ⇒ `replaceAll(demoData())`.

## Store (`src/state/store.tsx`) FROZEN
```ts
useData(): AppData
useDerived(today?): Derived  // {today, sales: Map<id,SalePaymentInfo>, clients, batches, products, supplierOwed, owedToYou, youOwe,
                             //  generalCosts, todoImportCount, period(range), clientById, supplierById, productById, batchById, categoryById, saleById}
useActions(): {
  upsert(collection, item): void            // insert or replace by id
  upsertMany(collection, items): void       // one change, one autosave (imports)
  remove(collection, id): boolean           // false if protected & referenced. Sale removal clears payments' saleId; removing
                                            // sale/payment/expense resets linked import rows to 'todo'
  archive(collection, id, archived): void
  updateSettings(patch): void
  replaceAll(data, {backupReason?: BackupReason|false}): Promise<void>  // backs up first (default 'pre-replace'), validates,
                                            // saves immediately, leaves recovery mode; rejects on invalid data
  isReferenced(collection, id): boolean
  flush(): Promise<void>
}
useAppStatus(): { status: 'loading'|'ready'|'recovery', lastSavedAt?, saveError?, recoveryError?, migratedFrom?, dirty }
useStorage(): Storage
computeDerived(data, today?)   // non-hook
```
Autosave 300 ms after last change; flushed on close/pagehide/visibility-hidden. No saves in recovery; never writes an empty dataset over loaded content. Before an Excel import that changes data call `await useStorage().backupNow('pre-import')`.
Tests: `<StoreProvider storage={new MemoryStorage(demoData())}>` (from `src/storage/memoryStorage.ts`) or `<App storage={…}/>`.

## Storage (`src/storage/types.ts`) FROZEN
`load(): LoadResult ('ok'|'empty'|'corrupt')`, `save(data)`, `flush()`, `backupNow(reason?) → BackupInfo{id,createdAt,reason,sizeBytes?,path?}`, `listBackups()` (newest first), `restoreBackup(id) → RestoreResult` (does NOT write; then `replaceAll(r.data,{backupReason:'pre-restore'})`), `exportBackupFile(data) → boolean`, `importBackupFile(file?) → RestoreResult|null` (web: pass File; Electron: no arg ⇒ dialog), `saveFile(bytes|Blob, name, mime) → boolean` (**use this for the Excel export**), `openDataFolder?()`, `info() → {kind:'electron'|'web', dataPath?, backupDir?}`, `appVersion?()`, `checkForUpdates?() → UpdateCheckResult`, `onBeforeClose(cb)`. `getStorage()`, `isElectron()` from `src/storage`.
Web: IndexedDB `pittig-finances` (stores `kv`, `backups`), daily backup (keep 30) + others (keep 20), `navigator.storage.persist()`.

## Preload API (`src/storage/electronApi.ts`) FROZEN – for 2d
`window.pittig: PittigBridge` = `info {dataPath, backupDir, appVersion, platform}` (sync via `sendSync(IPC.info)`), `readData() → {exists:false}|{exists:true,text}`, `writeData(text) → {savedAt}` (atomic tmp+rename, retry 5× EBUSY/EPERM, reject non-JSON), `backupNow(reason)`, `listBackups()`, `readBackup(id) → text`, `exportBackupFile(text, name)`, `importBackupFile()`, `saveFile(bytes, name, filters)`, `openDataFolder()`, `checkForUpdates()` (never rejects), `onBeforeClose(cb)`. Channel names in `IPC`. `electron/preload.ts` is already complete; `electron/main.ts` is a stub (window only). Main makes the 'daily' backup at startup, and on close sends `IPC.beforeClose`, waits for `IPC.closeReady` (≤3 s).

## i18n (`src/i18n`)
Area file `src/i18n/<area>.ts`: `export const nl = {...} as const; export const en: Translations<typeof nl> = {...}` (same keys – a test enforces it). Areas: common, overview, sales, clients, expenses, suppliers, batches, import, settings.
```ts
const t = useT('sales'); t('title'); t('key', { name: 'Toko' })   // "{name}" interpolation, typed keys, falls back to nl
const tc = useT('common');                                         // shared words: save, cancel, delete, archive, client, amount, paid, overdue, walkIn, …
const f = useFormat(); f.money(1250, {signed}) f.date(iso, 'short'|'medium'|'long') f.month('2026-03'); f.lang
useLang(); translate(lang, area, key, vars)
```

## Router (`src/router.tsx`, routes in `src/routes.ts`) FROZEN
Hash URLs: `#/sales`, `#/clients/<id>`. Each screen owns its base and all sub-paths; handle detail views inside the screen:
```ts
const m = useMatch('/clients/:id');  // {id} | null
const { path, segments, query } = useRoute();
navigate('/clients/' + id); navigate(p, {replace:true}); goBack('/clients'); href('/sales') → '#/sales'; <Link to="/sales">
```
Bases: `/overview /sales /clients /expenses /batches /suppliers /import /settings` (+ shell-only `/more` on phone). Query params are free to use (e.g. `#/sales?new=1` to open the add sheet from Overview's "+ Sale"). "To sort" shows in nav only when `todoImportCount > 0`.

## UI (`src/ui`, `import { … } from '../../ui'`)
- `Button {variant:'primary'|'secondary'|'plain'|'destructive', size:'sm'|'md'|'lg', icon?, block?}` – type="button" by default.
- `Sheet {open, onClose, title, onSubmit?, submitLabel?, submitDisabled?, cancelLabel?, footer?, size?:'md'|'lg'}` – with `onSubmit` it is a `<form>`: Enter submits, Save top-right; Esc/scrim/Cancel close; focus trap; initial focus = `[data-autofocus]` or first field. Group fields with `<div className="pf-form-section">` and side-by-side with `pf-form-row`.
- `Field {label, hint?, error?, optionalLabel?, inline?}` wrapping one control; controls auto-wire id/aria: `TextInput`, `TextArea`, `Select {value, onChange(v), options, placeholder?}`, `MoneyInput {value: Cents|null, onChange(Cents|null), allowNegative?}`, `DateField {value?: ISODate, onChange(iso|undefined)}`, `Combobox {value?, onChange(id|undefined), options:{value,label,hint?}[], onCreate?(label)=>newId, allowClear?, placeholder?}`.
- `Chips {options:{value,label,color?}[], value?, onChange, 'aria-label', allowDeselect?, trailing?}`, `Segmented {options, value, onChange, 'aria-label', size?, block?}`, `Toggle {checked, onChange, label, description?}`.
- `Card {title?, action?, padded?}`, `Stat {label, value, hint?}`, `List {header?, footer?}` + `ListRow {title, subtitle?, detail?, leading?, badge?, href?|onClick?, chevron?, muted?}`, `Badge {tone:'neutral'|'accent'|'success'|'warning'|'danger'}`, `EmptyState {icon?, title, message?, action?}`, `Amount {cents, tone?:'in'|'out'|'neutral'|'auto', signed?, size?:'sm'|'md'|'lg'|'xl', compact?}`.
- `PageHeader {title, subtitle?, action?, back?:{href,label}, children? (toolbar)}`, `SearchField {value, onChange, placeholder?}`.
- `ConfirmDialog {open, title, message?, confirmLabel?, destructive?, onConfirm, onCancel}` or `const confirm = useConfirm(); if (await confirm({title, destructive:true}))`.
- `const toast = useToast(); toast.show(msg, {tone?:'success'|'danger', action?:{label,onClick}})`.
- `Icon {name, size?, label?}` – names: plus check close chevron-right/left/down search overview sales clients expenses batches suppliers import settings more alert download upload trash archive edit calendar folder refresh money.
- Layout helpers (shell.css): `pf-stack` (16px gap column), `pf-stack--lg`, `pf-grid` (auto-fit cards), `pf-row-actions`, `muted`, `num` (tabular numbers), `visually-hidden`.
- Tokens (`tokens.css`): `--s-1…--s-8` (8pt), `--radius`, `--bg`, `--bg-elevated`, `--bg-fill`, `--label`, `--label-2`, `--separator`, `--accent`, `--accent-fill`, `--on-accent`, `--success`, `--warning`, `--danger`, `--*-soft`, `--text-*`. Light + dark automatic.
