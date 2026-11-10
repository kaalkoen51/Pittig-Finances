# Pittig Finances – Build plan (v1)

## Goal
A dead-simple finance app for a small product business (one owner, few buyers).
She must be able to: log sales, see money coming in per client, log expenses,
see costs and profit per product batch, see who she owes (creditors) and who owes
her (debtors), and import/export Excel. Windows PC first, phone second.
No automatic classification: everything is categorised by hand, but made quick.

## Platform decision
One codebase, two shells:
- **Web app**: Vite + React 19 + TypeScript, plain CSS with design tokens.
- **Windows**: Electron 45 shell around the same build. Installed with a normal
  `Setup.exe` (NSIS, per-user install, no admin rights, desktop + start-menu
  shortcut). Data lives in a plain JSON file in
  `Documents\Pittig Finances\pittig-data.json`, so it is easy to find and back up.
  Automatic rolling backups in `Documents\Pittig Finances\Backups` (one per day
  the app is used, keep the last 30). Atomic writes (write temp file, rename).
- **Phone**: the same web build deployed as an installable PWA (GitHub Pages).
  Storage is IndexedDB on that device. PC and phone do NOT sync in v1; data can
  be moved with the backup file. (Stated honestly in the handover guide.)
- Updates on Windows: `electron-updater` against GitHub Releases. A GitHub
  Actions workflow builds the installer on `windows-latest` when a `v*` tag is
  pushed and attaches it to a Release.

No native modules (no SQLite) so the build is simple and reproducible.

## Data model (src/domain/types.ts)
All money stored as integer cents. Dates as `YYYY-MM-DD` strings. IDs are UUIDs.
- `Client { id, name, email?, phone?, notes?, archived }`
- `Supplier { id, name, email?, phone?, notes?, archived }` (creditors)
- `Product { id, name, unit (e.g. "jar"), defaultPrice (cents), archived }`
- `Batch { id, productId, code, producedOn, quantity, notes?, closed }`
- `Sale { id, date, clientId?, items: SaleItem[], notes?, dueDate? }`
  `SaleItem { productId, batchId?, quantity, unitPrice }`
- `Payment { id, date, clientId?, saleId?, amount, method?, notes? }` (money in)
- `Expense { id, date, supplierId?, categoryId, batchId?, description, amount,
   paidOn? (null = still owed), dueDate? }`
- `Category { id, name, kind: 'expense' | 'income', color }` – user editable;
  starts with: Ingredients, Packaging, Labels & print, Equipment, Transport,
  Market fees, Marketing, Other.
- `ImportRow { id, date, description, amount, source, status: 'todo'|'done'|'ignored', linkedId? }`
  rows from a bank/Excel import waiting to be sorted by hand.
- `Settings { businessName, currency ('EUR'), language ('nl'|'en'), firstRunDone }`
- `AppData { version, clients, suppliers, products, batches, sales, payments,
   expenses, categories, importRows, settings }` with a `version` for migrations.

Derived (pure functions in src/domain/calc.ts, unit tested):
- sale total, amount paid per sale, open balance per sale/client (debtors)
- totals per client (sold, received, outstanding)
- per batch: units sold, revenue, costs (expenses linked to batch), profit,
  cost per unit, units left
- owed to suppliers (unpaid expenses), grouped per supplier, overdue flag
- period summaries (this month / last month / this year): money in, money out, profit

## Screens (sidebar on PC, bottom tab bar on phone)
1. **Overview** – this month: money in, money out, result; "Owed to you",
   "You owe"; recent activity; two big buttons: "+ Sale", "+ Expense".
2. **Sales** – list with search + month filter; add/edit sheet: date, client
   (pick or type new), product, batch, qty, price (prefilled), "Paid already" toggle.
   Unpaid sales show a badge and a "Record payment" action.
3. **Clients** – list with total bought / received / still open; detail shows
   history and a "Record payment" button (money in per client).
4. **Expenses** – list; add sheet: date, amount, description, category chips,
   supplier, batch (optional), "Paid already" toggle (else: due date → creditor).
5. **Batches** – per product: batches with cost, revenue, profit, cost/unit,
   units left. Products managed here too.
6. **Suppliers** ("Who I owe") – what is owed per supplier, mark as paid.
7. **To sort** (only visible when import rows exist) – imported bank/Excel rows;
   each row: "This is a sale payment from…" (pick client) or "This is an expense"
   (pick category, optional supplier/batch) or "Ignore". One click per row.
8. **Settings** – business name, language, currency, categories, Excel
   import/export, backup now / restore from backup, open data folder (PC).

## Excel (exceljs, run in renderer)
- **Export**: one .xlsx with sheets Sales, Payments, Expenses, Clients,
  Suppliers, Batches (with profit), Summary per month. Real number/date cells,
  euro formatting, header styling, frozen header row.
- **Import**: wizard: choose file → choose sheet → map columns (date,
  description, amount, optional client/supplier) with auto-guess from header
  names (Dutch + English bank terms) → preview → rows become "To sort" items, or
  can be imported directly as Sales/Expenses/Clients from our own export format
  (round-trip). Parse Dutch number formats (1.234,56) and dates (dd-mm-yyyy).
  CSV is also accepted (common bank export).

## Design (Apple HIG feel)
- System font stack (`-apple-system, "Segoe UI Variable", "Segoe UI", system-ui`),
  large clear titles, generous spacing (8pt grid), rounded cards (12px),
  subtle separators, one accent colour, soft grouped-background like iOS
  Settings, light + dark mode via `prefers-color-scheme`.
- Sheets/modals slide up, forms are short, sensible defaults (today's date,
  last used client/product), keyboard friendly (Enter to save, Esc to close).
- Amounts right aligned, tabular numbers, green for in, neutral for out,
  never more than one primary button per view. Empty states that explain what to do.
- UI language: Dutch and English (simple dictionary in src/i18n), Dutch default
  (business owner presumed Dutch-speaking; switch in Settings).

## Architecture / folders
```
src/domain/     types.ts, calc.ts, money.ts, dates.ts, migrate.ts (+ *.test.ts)
src/storage/    Storage interface; electronStorage.ts (IPC), idbStorage.ts (PWA)
src/state/      store.tsx (React context + reducer, autosave debounced 300ms)
src/excel/      export.ts, import.ts, parse.ts (+ tests)
src/i18n/       nl.ts, en.ts, index.ts
src/ui/         components (Button, Sheet, Field, MoneyInput, List, Card, Badge, EmptyState, Segmented)
src/screens/    one folder per screen
electron/       main.ts, preload.ts (contextIsolation, no nodeIntegration)
.github/workflows/  build-windows.yml (on tag), pages.yml (PWA), ci.yml (test+build)
docs/           PLAN.md, HANDOVER.md
```

## Work breakdown (subagents)
1. Foundation: scaffold, domain types + calc + tests, storage, store, i18n, design
   system components, app shell + navigation.
2. In parallel, after 1:
   a. Sales, Clients, payments, Overview screens
   b. Expenses, Suppliers, Batches/Products screens
   c. Excel import/export + To sort + Settings/backup/restore
   d. Electron shell, packaging, CI workflows, PWA manifest/service worker
3. Peer review: code/correctness reviewer + UX/design reviewer.
4. Fix round, final verification (typecheck, tests, build, screenshots).
5. Handover guide + PR.

## Acceptance
- `npm test`, `npm run typecheck`, `npm run build` pass.
- Windows installer builds in CI. App opens with an empty-state onboarding.
- Can add sale → shows in client balance and batch revenue; record payment →
  balance drops; add unpaid expense → appears under "You owe"; mark paid.
- Export to Excel and re-import round trip works.

---

## Revisions after peer review (binding; overrides the sections above)

**Data safety**
- Live file: Electron `app.getPath('userData')/pittig-data.json` (not Documents, avoids OneDrive locks).
  Backups: `Documents\Pittig Finances\Backups\pittig-backup-YYYY-MM-DD.json` (daily, keep 30) plus
  a backup before every migration, restore and import. Atomic write (tmp + rename, retry 5x on EBUSY/EPERM).
- If the file exists but fails to parse/validate: app enters **recovery mode** — autosave disabled,
  screen offers "Restore latest backup (date)". Never save an empty dataset over a non-empty file.
- Debounced save is flushed on `beforeunload` / window close; main process waits for the flush.
  `requestSingleInstanceLock`.
- NSIS: per-user, `deleteAppDataOnUninstall: false`. Upgrade keeps data.
- Updates: `electron-updater` with GitHub provider; failures are silent. Works only if releases are
  public (repo public or a public releases-only repo) – documented in HANDOVER.md. Settings shows
  version + "Check for updates".

**Money semantics**
- `Payment.clientId` is required, `saleId` optional. Client open balance = Σ sales − Σ payments.
- Per-sale paid status: payments with `saleId` apply to that sale first; remaining payments of the
  client are applied to the client's sales oldest-first (FIFO). Status: paid / partly paid / open.
- A sale without client ("Walk-in / market") is always paid: it auto-creates no payment and simply
  counts as received on its date. (calc treats clientless sales as paid.)
- "Paid already" toggle on a sale with client creates a Payment {saleId, clientId, amount = total, date = sale date}.
- Refunds: `Payment.amount` and `Expense.amount` may be negative (a "Refund" toggle in the form).
- No VAT in v1 (assumed small business / KOR). Currency fixed EUR. Drop `Category.kind`; all categories are expense categories.

**Referential rules**
- Client, Supplier, Product, Batch, Category can be deleted only if nothing references them;
  otherwise the UI offers Archive. Store exposes `isReferenced(collection, id)`.

**Batches**
- Cost per unit = linked expenses ÷ quantity produced. Unlinked expenses = "General costs", shown
  separately on Overview and Batches. Sale form preselects newest open batch of the chosen product.
  No cost splitting across batches in v1.

**Import**
- ImportRow gets `fingerprint = date|amountCents|normalized description|source`; duplicates skipped (count shown).
- "To sort" options per row: Payment from client (pick client, optional sale) / Expense (category,
  supplier?, batch?) / **Matches existing** (suggestions: same |amount|, date ±7 days, unlinked) / Ignore.
  Positive amount defaults to payment, negative to expense.
- Excel import paths: (1) bank/any sheet → column mapping → To sort; (2) own export format round-trip
  for Clients/Suppliers/Products, matched by ID column then name (no duplicate creation).
  JSON backup is the real restore path. CSV accepted (`;` or `,` separator, Dutch numbers/dates).

**Mobile**
- The UI is fully responsive (bottom tab bar < 760px). PWA manifest + service worker included and a
  Pages workflow is provided, but data on the phone is separate (IndexedDB, `navigator.storage.persist()`),
  and the app shows a clear "This device only" note there. Primary product = Windows.

**UX extras**: Sale form one line by default + "Add another product"; shows client's open balance.
"Last backup" shown in Settings. Overview has period picker (This month / Last month / This year / All).

**Parallel-work contracts (frozen by foundation agent before feature agents start)**
- `src/domain/types.ts` frozen; changes only via orchestrator.
- Store API: `useData()` returns AppData + derived helpers; `useActions()` returns
  `upsert(collection, item)`, `remove(collection, id)`, `archive(collection, id, archived)`,
  `updateSettings(partial)`, `replaceAll(data)`, `isReferenced(collection, id)`. Feature agents never edit the reducer.
- Routes + nav items pre-registered with placeholder screens in `src/screens/<name>/index.tsx`.
- All deps in package.json + lockfile up front. Feature agents don't touch package.json.
- Storage interface (src/storage/types.ts): `load(): Promise<LoadResult>`, `save(data)`, `flush()`,
  `backupNow(): Promise<BackupInfo>`, `listBackups()`, `restoreBackup(id)`, `exportBackupFile(data)`,
  `importBackupFile(file)`, `openDataFolder?()`, `info(): {kind:'electron'|'web', dataPath?, backupDir?}`,
  `appVersion?()`, `checkForUpdates?()`.
- Shared UI components ready: Button, Sheet (modal), Field, TextInput, MoneyInput, DateField,
  Combobox (pick or create), Chips, Segmented, Toggle, Card, List/ListRow, Badge, EmptyState, Amount, ConfirmDialog, Toast.
- i18n split per area: `src/i18n/<area>.ts` exporting `{nl, en}`; areas: common, overview, sales,
  clients, expenses, suppliers, batches, import, settings.
- Seed fixture `src/domain/fixtures.ts` (demo data, also usable from Settings → "Load demo data" in dev).
- Folder ownership: 2a = screens overview/sales/clients; 2b = screens expenses/suppliers/batches;
  2c = src/excel + screens import(to sort)/settings; 2d = electron/, src/storage/electronStorage.ts,
  build config, .github/workflows, PWA config.

**Extra acceptance**: Playwright e2e of main flow against the web build; corrupt-file recovery unit
test; migration test; Dutch number/date parsing tests; import dedupe test; dark-mode screenshot check.
