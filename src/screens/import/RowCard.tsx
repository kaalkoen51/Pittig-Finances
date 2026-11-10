import { useMemo, useState } from 'react';
import { openSalesForClient } from '../../domain/calc';
import { newId } from '../../domain/ids';
import type { Expense, ImportRow, Payment } from '../../domain/types';
import { exactNameMatch, expenseFromRow, linkRow, markExpensePaidByRow, matchSuggestions, paymentFromRow, reopenRow, type Suggestion } from '../../excel/match';
import { useFormat, useT } from '../../i18n';
import { useActions, useData, useDerived } from '../../state/store';
import { Amount, Badge, Button, Chips, Combobox, ConfirmDialog, Field, Segmented, Select, Toggle, useToast } from '../../ui';

type Mode = 'payment' | 'expense' | 'match';

/** One "to sort" bank line with the three ways to sort it plus Ignore. */
export function RowCard({ row }: { row: ImportRow }) {
  const t = useT('import');
  const f = useFormat();
  const data = useData();
  const derived = useDerived();
  const actions = useActions();
  const toast = useToast();

  const suggestions = useMemo(() => matchSuggestions(data, row), [data, row]);
  const [mode, setMode] = useState<Mode>(row.amount >= 0 ? 'payment' : 'expense');

  // Payment
  const suggestedClient = useMemo(() => exactNameMatch(data.clients, row.counterparty), [data.clients, row.counterparty]);
  const [clientId, setClientId] = useState<string | undefined>(suggestedClient);
  const [saleId, setSaleId] = useState('');
  const openSales = useMemo(() => (clientId ? openSalesForClient(data, clientId, derived.today) : []), [data, clientId, derived.today]);

  // Expense
  const activeCategories = data.categories.filter((c) => !c.archived);
  const lastCat = data.settings.lastUsed?.categoryId;
  const [categoryId, setCategoryId] = useState<string | undefined>(lastCat && activeCategories.some((c) => c.id === lastCat) ? lastCat : undefined);
  const suggestedSupplier = useMemo(() => exactNameMatch(data.suppliers, row.counterparty), [data.suppliers, row.counterparty]);
  const [supplierId, setSupplierId] = useState<string | undefined>(suggestedSupplier);
  const [batchId, setBatchId] = useState('');

  // Match
  const [matchKey, setMatchKey] = useState<string | undefined>(suggestions[0]?.item.id);

  const clientOptions = data.clients.filter((c) => !c.archived || c.id === clientId).map((c) => ({ value: c.id, label: c.name }));
  const supplierOptions = data.suppliers.filter((s) => !s.archived || s.id === supplierId).map((s) => ({ value: s.id, label: s.name }));
  const batchOptions = data.batches
    .filter((b) => !b.closed || b.id === batchId)
    .map((b) => ({ value: b.id, label: `${b.code} · ${derived.productById.get(b.productId)?.name ?? ''}` }));

  const createClient = (name: string) => {
    const id = newId();
    actions.upsert('clients', { id, name, archived: false });
    return id;
  };
  const createSupplier = (name: string) => {
    const id = newId();
    actions.upsert('suppliers', { id, name, archived: false });
    return id;
  };

  /** `created`: the payment/expense was made from this row (reopening then offers to delete it). */
  const markDone = (collection: 'payments' | 'expenses', id: string, created: boolean) => actions.upsert('importRows', linkRow(row, collection, id, created));

  const savePayment = () => {
    if (!clientId) return;
    const p: Payment = paymentFromRow(row, clientId, saleId || undefined);
    actions.upsert('payments', p);
    markDone('payments', p.id, true);
    actions.updateSettings({ lastUsed: { clientId } });
    // Removing the payment resets the import row to 'todo' (store rule).
    toast.show(t('savedPayment'), { tone: 'success', action: { label: tUndo(), onClick: () => actions.remove('payments', p.id) } });
  };

  const saveExpense = () => {
    if (!categoryId) return;
    const e: Expense = expenseFromRow(row, { categoryId, supplierId, batchId: batchId || undefined });
    actions.upsert('expenses', e);
    markDone('expenses', e.id, true);
    actions.updateSettings({ lastUsed: { categoryId, ...(supplierId ? { supplierId } : {}) } });
    toast.show(t('savedExpense'), { tone: 'success', action: { label: tUndo(), onClick: () => actions.remove('expenses', e.id) } });
  };

  const saveMatch = () => {
    const s = suggestions.find((x) => x.item.id === matchKey);
    if (!s) return;
    let undoExpense: Expense | undefined;
    if (s.collection === 'expenses') {
      // An unpaid expense matched to a bank payment is now paid (on the bank date).
      const paid = markExpensePaidByRow(s.item, row);
      if (paid !== s.item) {
        undoExpense = s.item;
        actions.upsert('expenses', paid);
      }
    }
    markDone(s.collection, s.item.id, false);
    toast.show(t('linked'), {
      tone: 'success',
      action: {
        label: tUndo(),
        onClick: () => {
          if (undoExpense) actions.upsert('expenses', undoExpense);
          actions.upsert('importRows', reopenRow(row));
        },
      },
    });
  };

  const ignore = () => {
    actions.upsert('importRows', { ...reopenRow(row), status: 'ignored' });
    toast.show(t('ignored'), { action: { label: tUndo(), onClick: () => actions.upsert('importRows', reopenRow(row)) } });
  };

  const tc = useT('common');
  function tUndo() {
    return tc('undo');
  }

  const suggestionLabel = (s: Suggestion) =>
    s.collection === 'payments'
      ? t('suggestionPayment', { client: derived.clientById.get(s.item.clientId)?.name ?? '', date: f.date(s.item.date) })
      : t('suggestionExpense', { description: s.item.description || derived.supplierById.get(s.item.supplierId ?? '')?.name || '', date: f.date(s.item.paidOn ?? s.item.date) });

  const title = row.counterparty || row.description;
  const subtitle = row.counterparty && row.description !== row.counterparty ? row.description : undefined;

  return (
    <article className="import-row" aria-label={`${title} ${f.money(row.amount, { signed: true })}`}>
      <header className="import-row__head">
        <div className="import-row__text">
          <div className="import-row__date muted">{f.date(row.date)}</div>
          <div className="import-row__title">{title}</div>
          {subtitle && <div className="import-row__desc muted">{subtitle}</div>}
        </div>
        <Amount cents={row.amount} tone={row.amount >= 0 ? 'in' : 'neutral'} signed size="lg" />
      </header>

      <Segmented<Mode>
        aria-label={t('whatIsThis')}
        size="sm"
        block
        value={mode}
        onChange={setMode}
        options={[
          { value: 'payment', label: t('asPayment') },
          { value: 'expense', label: t('asExpense') },
          { value: 'match', label: suggestions.length ? t('asMatchCount', { count: suggestions.length }) : t('asMatch') },
        ]}
      />

      <div className="import-row__body">
        {mode === 'payment' && (
          <div className="pf-form-section">
            <Field label={tc('client')} hint={clientId && clientId === suggestedClient ? t('suggestedName') : row.amount < 0 ? t('refundHintPayment') : undefined}>
              <Combobox
                value={clientId}
                onChange={(v) => {
                  setClientId(v);
                  setSaleId('');
                }}
                options={clientOptions}
                onCreate={createClient}
                placeholder={t('pickClient')}
                allowClear
              />
            </Field>
            {openSales.length > 0 && (
              <Field label={t('forSale')} optionalLabel={tc('optional')}>
                <Select
                  value={saleId}
                  onChange={setSaleId}
                  placeholder={t('anySale')}
                  options={openSales.map(({ sale, info }) => ({ value: sale.id, label: t('saleOption', { date: f.date(sale.date), amount: f.money(info.open) }) }))}
                />
              </Field>
            )}
          </div>
        )}

        {mode === 'expense' && (
          <div className="pf-form-section">
            <Field label={tc('category')} hint={row.amount > 0 ? t('refundHintExpense') : undefined}>
              <Chips aria-label={tc('category')} value={categoryId} onChange={setCategoryId} options={activeCategories.map((c) => ({ value: c.id, label: c.name, color: c.color }))} />
            </Field>
            <div className="pf-form-row">
              <Field label={tc('supplier')} optionalLabel={tc('optional')} hint={supplierId && supplierId === suggestedSupplier ? t('suggestedName') : undefined}>
                <Combobox value={supplierId} onChange={setSupplierId} options={supplierOptions} onCreate={createSupplier} placeholder={t('pickSupplier')} allowClear />
              </Field>
              {batchOptions.length > 0 && (
                <Field label={tc('batch')} optionalLabel={tc('optional')}>
                  <Select value={batchId} onChange={setBatchId} placeholder={t('noBatch')} options={batchOptions} />
                </Field>
              )}
            </div>
          </div>
        )}

        {mode === 'match' &&
          (suggestions.length === 0 ? (
            <p className="muted">{t('noSuggestions')}</p>
          ) : (
            <div className="import-row__matches" role="radiogroup" aria-label={t('asMatch')}>
              {suggestions.map((s) => (
                <label key={s.item.id} className={'import-match' + (matchKey === s.item.id ? ' is-selected' : '')}>
                  <input type="radio" name={`match-${row.id}`} checked={matchKey === s.item.id} onChange={() => setMatchKey(s.item.id)} />
                  <span className="import-match__label">{suggestionLabel(s)}</span>
                  <Amount cents={s.collection === 'payments' ? s.item.amount : -s.item.amount} tone="auto" signed size="sm" />
                </label>
              ))}
            </div>
          ))}
      </div>

      <footer className="import-row__actions">
        <Button variant="plain" onClick={ignore}>
          {t('ignore')}
        </Button>
        {mode === 'payment' && (
          <Button variant="primary" onClick={savePayment} disabled={!clientId}>
            {t('confirmPayment')}
          </Button>
        )}
        {mode === 'expense' && (
          <Button variant="primary" onClick={saveExpense} disabled={!categoryId}>
            {t('confirmExpense')}
          </Button>
        )}
        {mode === 'match' && (
          <Button variant="primary" onClick={saveMatch} disabled={!suggestions.some((s) => s.item.id === matchKey)}>
            {t('confirmMatch')}
          </Button>
        )}
      </footer>
    </article>
  );
}

/** A sorted (done / ignored) row in the history list. */
export function HandledRow({ row }: { row: ImportRow }) {
  const t = useT('import');
  const tc = useT('common');
  const f = useFormat();
  const data = useData();
  const actions = useActions();
  const toast = useToast();
  const [asking, setAsking] = useState(false);
  const [alsoDelete, setAlsoDelete] = useState(false);
  const linkedLabel = row.linkedCollection === 'payments' ? t('linkedPayment') : row.linkedCollection === 'expenses' ? t('linkedExpense') : row.linkedCollection === 'sales' ? t('linkedSale') : null;
  const linkedCollection = row.status === 'done' && (row.linkedCollection === 'payments' || row.linkedCollection === 'expenses') ? row.linkedCollection : null;
  const linkedExists =
    !!linkedCollection && !!row.linkedId && (data[linkedCollection] as { id: string }[]).some((x) => x.id === row.linkedId);

  const reopenOnly = () => {
    actions.upsert('importRows', reopenRow(row));
    toast.show(row.status === 'done' ? `${t('reopened')}. ${t('reopenHint')}` : t('reopened'));
  };

  const confirmReopen = () => {
    setAsking(false);
    if (alsoDelete && linkedCollection && row.linkedId) {
      // Removing the linked record also resets this row to 'todo' (store rule); undo restores both.
      const undo = actions.removeWithUndo(linkedCollection, row.linkedId);
      if (undo) {
        toast.show(t('reopenedDeleted'), { action: { label: tc('undo'), onClick: undo } });
        return;
      }
    }
    reopenOnly();
  };

  return (
    <div className="import-handled">
      <div className="import-handled__text">
        <div className="import-row__title">{row.counterparty || row.description}</div>
        <div className="muted import-handled__meta">
          {f.date(row.date)} · {row.status === 'ignored' ? <Badge>{t('statusIgnored')}</Badge> : <Badge tone="success">{linkedLabel ?? t('statusDone')}</Badge>}
        </div>
      </div>
      <Amount cents={row.amount} tone={row.amount >= 0 ? 'in' : 'neutral'} signed size="sm" />
      <Button
        variant="plain"
        size="sm"
        title={row.status === 'done' ? t('reopenHint') : undefined}
        onClick={() => {
          if (!linkedExists) return reopenOnly();
          // Default on when this row created the payment/expense, off when it was matched to an existing one.
          setAlsoDelete(row.linkCreated === true);
          setAsking(true);
        }}
      >
        {t('reopen')}
      </Button>
      <ConfirmDialog
        open={asking}
        title={t('reopenTitle')}
        message={
          <Toggle
            checked={alsoDelete}
            onChange={setAlsoDelete}
            label={linkedCollection === 'payments' ? t('reopenDeletePayment') : t('reopenDeleteExpense')}
            description={row.linkCreated ? t('reopenCreatedHint') : t('reopenMatchedHint')}
          />
        }
        confirmLabel={t('reopen')}
        onConfirm={confirmReopen}
        onCancel={() => setAsking(false)}
      />
    </div>
  );
}
