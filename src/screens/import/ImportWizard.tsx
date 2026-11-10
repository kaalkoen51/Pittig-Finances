import { useMemo, useRef, useState, type DragEvent } from 'react';
import { buildImportRows, findEntitySheets, planEntityImport, type EntityKind } from '../../excel/import';
import {
  cellText,
  detectHeaderRow,
  guessMapping,
  ImportFileError,
  MAP_FIELDS,
  parseRows,
  readWorkbook,
  type ColumnMapping,
  type MapField,
  type WorkbookData,
} from '../../excel/parse';
import { useFormat, useT } from '../../i18n';
import { useActions, useData, useStorage } from '../../state/store';
import { Amount, Button, Field, Icon, ListRow, List, Select, Sheet, useToast } from '../../ui';

type Step = 'file' | 'sheet' | 'map' | 'entities';

export interface ImportWizardProps {
  open: boolean;
  onClose: () => void;
}

const colLetter = (i: number) => {
  let s = '';
  let n = i + 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
};

const FIELD_LABEL: Record<MapField, 'fieldDate' | 'fieldAmount' | 'fieldDirection' | 'fieldCounterparty' | 'fieldDescription'> = {
  date: 'fieldDate',
  amount: 'fieldAmount',
  direction: 'fieldDirection',
  counterparty: 'fieldCounterparty',
  description: 'fieldDescription',
};

/** File → sheet → column mapping (with live preview) → import into "To sort". */
export function ImportWizard({ open, onClose }: ImportWizardProps) {
  const t = useT('import');
  const f = useFormat();
  const data = useData();
  const actions = useActions();
  const storage = useStorage();
  const toast = useToast();
  const [step, setStep] = useState<Step>('file');
  const [wb, setWb] = useState<WorkbookData | null>(null);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [headerRow, setHeaderRow] = useState(0);
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setStep('file');
    setWb(null);
    setSheetIndex(0);
    setMapping(null);
    setError(null);
    setBusy(false);
  };
  const close = () => {
    reset();
    onClose();
  };

  const table = wb?.sheets[sheetIndex];

  const chooseSheet = (w: WorkbookData, i: number) => {
    const rows = w.sheets[i]?.rows ?? [];
    const h = detectHeaderRow(rows);
    setSheetIndex(i);
    setHeaderRow(h);
    setMapping(guessMapping(rows[h] ?? [], rows.slice(h + 1, h + 21)));
    setStep('map');
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const w = await readWorkbook(await file.arrayBuffer(), file.name);
      setWb(w);
      if (findEntitySheets(w).length) setStep('entities');
      else if (w.sheets.length > 1) setStep('sheet');
      else chooseSheet(w, 0);
    } catch (e) {
      const code = e instanceof ImportFileError ? e.code : 'unreadable';
      setError(t(code === 'unsupported' ? 'errorUnsupported' : code === 'empty' ? 'errorEmpty' : 'errorUnreadable'));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const parsed = useMemo(() => (table && mapping ? parseRows(table.rows, headerRow, mapping) : []), [table, mapping, headerRow]);
  const valid = parsed.filter((p) => !p.error).length;
  const invalid = parsed.length - valid;
  const canImport = !!mapping && mapping.date >= 0 && mapping.amount >= 0 && valid > 0;

  const doImport = async () => {
    if (!wb || !canImport || busy) return;
    setBusy(true);
    try {
      const res = buildImportRows(parsed, wb.fileName, data.importRows);
      if (res.rows.length) {
        await storage.backupNow('pre-import');
        actions.upsertMany('importRows', res.rows);
      }
      toast.show(res.rows.length ? t('result', { added: res.rows.length, duplicates: res.duplicates }) : t('resultNone', { duplicates: res.duplicates }), { tone: 'success' });
      close();
    } catch (e) {
      setBusy(false);
      toast.show(t('importFailed', { error: e instanceof Error ? e.message : String(e) }), { tone: 'danger' });
    }
  };

  const entitySheets = useMemo(() => (wb ? findEntitySheets(wb) : []), [wb]);
  const plan = useMemo(() => planEntityImport(data, entitySheets), [data, entitySheets]);
  const perKind = useMemo(
    () =>
      (['clients', 'suppliers', 'products'] as EntityKind[])
        .map((kind) => ({ kind, plan: planEntityImport(data, entitySheets.filter((s) => s.kind === kind)), present: entitySheets.some((s) => s.kind === kind) }))
        .filter((x) => x.present),
    [data, entitySheets],
  );

  const applyEntities = async () => {
    if (busy) return;
    if (plan.created + plan.updated === 0) {
      close();
      return;
    }
    setBusy(true);
    try {
      await storage.backupNow('pre-import');
      actions.upsertMany('clients', plan.clients);
      actions.upsertMany('suppliers', plan.suppliers);
      actions.upsertMany('products', plan.products);
      toast.show(t('ownResult', { created: plan.created, updated: plan.updated }), { tone: 'success' });
      close();
    } catch (e) {
      setBusy(false);
      toast.show(t('importFailed', { error: e instanceof Error ? e.message : String(e) }), { tone: 'danger' });
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    void onFile(e.dataTransfer.files[0]);
  };

  const header = table?.rows[headerRow] ?? [];
  const width = Math.max(header.length, ...(table?.rows.slice(headerRow + 1, headerRow + 20).map((r) => r.length) ?? [0]));
  const columnOptions = [
    { value: '-1', label: t('notUsed') },
    ...Array.from({ length: width }, (_, i) => ({ value: String(i), label: t('columnLabel', { col: colLetter(i), name: cellText(header[i] ?? null) || '…' }) })),
  ];
  const kindLabel = (k: EntityKind) => t(k === 'clients' ? 'kindClients' : k === 'suppliers' ? 'kindSuppliers' : 'kindProducts');

  const sheetProps =
    step === 'map'
      ? { onSubmit: doImport, submitLabel: t('importRows', { count: valid }), submitDisabled: !canImport || busy }
      : step === 'entities'
        ? { onSubmit: applyEntities, submitLabel: t('ownApply'), submitDisabled: busy }
        : {};

  return (
    <Sheet open={open} onClose={close} title={t('wizardTitle')} size="lg" className="import-wizard" dirty={step !== 'file'} {...sheetProps}>
      {step === 'file' && (
        <div className="pf-stack pf-stack--lg">
          <h3 className="import-wizard__step">{t('stepFile')}</h3>
          <p className="muted">{t('fileHelp')}</p>
          <div
            className={'import-drop' + (dragging ? ' is-dragging' : '')}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            <Icon name="upload" size={28} />
            <Button variant="primary" onClick={() => inputRef.current?.click()} disabled={busy} data-autofocus>
              {busy ? t('reading') : t('chooseFile')}
            </Button>
            <span className="muted">{t('dropHere')}</span>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xlsm,.csv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
              className="visually-hidden"
              tabIndex={-1}
              aria-label={t('chooseFile')}
              data-testid="import-file"
              onChange={(e) => void onFile(e.target.files?.[0])}
            />
          </div>
          {error && (
            <p className="import-error" role="alert">
              {error}
            </p>
          )}
        </div>
      )}

      {step === 'sheet' && wb && (
        <div className="pf-stack pf-stack--lg">
          <h3 className="import-wizard__step">{t('stepSheet')}</h3>
          <List>
            {wb.sheets.map((s, i) => (
              <ListRow key={s.name + i} title={s.name} detail={t('sheetRows', { count: s.rows.length })} chevron onClick={() => chooseSheet(wb, i)} />
            ))}
          </List>
          <div>
            <Button variant="plain" icon={<Icon name="chevron-left" size={16} />} onClick={reset}>
              {t('back')}
            </Button>
          </div>
        </div>
      )}

      {step === 'map' && table && mapping && (
        <div className="pf-stack pf-stack--lg">
          <div>
            <h3 className="import-wizard__step">{t('stepMap')}</h3>
            <p className="muted">{t('mapHelp')}</p>
          </div>
          <div className="pf-form-section import-map">
            {MAP_FIELDS.map((field) => (
              <Field key={field} label={t(FIELD_LABEL[field])} inline hint={field === 'direction' ? t('fieldDirectionHint') : undefined}>
                <Select value={String(mapping[field])} onChange={(v) => setMapping({ ...mapping, [field]: Number(v) })} options={columnOptions} />
              </Field>
            ))}
            <Field label={t('headerRow')} inline>
              <Select
                value={String(headerRow)}
                onChange={(v) => {
                  const h = Number(v);
                  setHeaderRow(h);
                  setMapping(guessMapping(table.rows[h] ?? [], table.rows.slice(h + 1, h + 21)));
                }}
                options={table.rows.slice(0, 15).map((_, i) => ({ value: String(i), label: t('rowN', { n: i + 1 }) }))}
              />
            </Field>
          </div>

          <section aria-label={t('preview')}>
            <h4 className="import-wizard__sub">{t('preview')}</h4>
            {parsed.length === 0 ? (
              <p className="muted">{t('previewEmpty')}</p>
            ) : (
              <div className="import-preview" role="table" aria-label={t('preview')}>
                {parsed.slice(0, 5).map((p) => (
                  <div key={p.line} role="row" className={'import-preview__row' + (p.error ? ' is-error' : '')}>
                    <span role="cell" className="import-preview__date num">
                      {p.date ? f.date(p.date, 'short') : <em>{t('unreadableDate')}</em>}
                    </span>
                    <span role="cell" className="import-preview__desc">
                      <strong>{p.counterparty ?? p.description}</strong>
                      {p.counterparty && p.description !== p.counterparty && <span className="muted"> · {p.description}</span>}
                    </span>
                    <span role="cell" className="import-preview__amount">
                      {p.amount !== null ? <Amount cents={p.amount} tone="auto" signed size="sm" /> : <em>{t('unreadableAmount')}</em>}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <p className="muted import-wizard__summary">
              {t('rowsFound', { count: valid })}
              {invalid > 0 && <> · {t('rowsInvalid', { count: invalid })}</>}
            </p>
          </section>
          <div>
            <Button variant="plain" icon={<Icon name="chevron-left" size={16} />} onClick={() => (wb && wb.sheets.length > 1 ? setStep('sheet') : reset())}>
              {t('back')}
            </Button>
          </div>
        </div>
      )}

      {step === 'entities' && wb && (
        <div className="pf-stack pf-stack--lg">
          <div>
            <h3 className="import-wizard__step">{t('ownTitle')}</h3>
            <p className="muted">{t('ownHelp')}</p>
          </div>
          <List>
            {perKind.map(({ kind, plan: p }) => (
              <ListRow
                key={kind}
                title={kindLabel(kind)}
                detail={[t('ownCreated', { count: p.created }), t('ownUpdated', { count: p.updated }), t('ownUnchanged', { count: p.unchanged })].join(' · ')}
              />
            ))}
          </List>
          {plan.created + plan.updated === 0 && <p className="muted">{t('ownNothing')}</p>}
          <div className="pf-row-actions">
            <Button variant="plain" icon={<Icon name="chevron-left" size={16} />} onClick={reset}>
              {t('back')}
            </Button>
            <Button variant="plain" onClick={() => (wb.sheets.length > 1 ? setStep('sheet') : chooseSheet(wb, 0))}>
              {t('ownAsRows')}
            </Button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
