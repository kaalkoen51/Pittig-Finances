/** Add / edit a sale. Export so other screens can open it: <SaleSheet open sale={…} onClose={…} />. */
import { useMemo, useState } from 'react';
import { paymentsForSale } from '../../domain/calc';
import { today as todayFn } from '../../domain/dates';
import { newId } from '../../domain/ids';
import type { Id, Sale } from '../../domain/types';
import { useFormat, useT } from '../../i18n';
import { useActions, useData, useDerived } from '../../state/store';
import { Amount, Button, Combobox, DateField, Field, Icon, MoneyInput, Select, Sheet, TextArea, TextInput, Toggle, useConfirm, useToast } from '../../ui';
import './sales.css';
import { RecordPaymentSheet } from '../clients/RecordPaymentSheet';
import {
  buildSaleSave,
  canTogglePaid,
  emptySaleForm,
  formTotal,
  hasErrors,
  lineForProduct,
  lineStateTotal,
  saleToForm,
  validateSaleForm,
  type LineState,
  type SaleFormErrors,
  type SaleFormState,
} from './saleForm';

export interface SaleSheetProps {
  open: boolean;
  onClose: () => void;
  /** Edit this sale; omit for a new one. */
  sale?: Sale;
  /** Preselect this client for a new sale. */
  clientId?: Id;
  onSaved?: (sale: Sale) => void;
}

export function SaleSheet(props: SaleSheetProps) {
  if (!props.open) return null;
  return <SaleSheetInner key={props.sale?.id ?? 'new'} {...props} />;
}

function SaleSheetInner({ onClose, sale, clientId, onSaved }: SaleSheetProps) {
  const t = useT('sales');
  const tc = useT('common');
  const f = useFormat();
  const data = useData();
  const derived = useDerived();
  const actions = useActions();
  const toast = useToast();
  const confirm = useConfirm();

  const linked = useMemo(() => (sale ? paymentsForSale(data, sale.id) : []), [data, sale]);
  const [form, setForm] = useState<SaleFormState>(() =>
    sale
      ? saleToForm(sale, linked, f.lang)
      : emptySaleForm(data, { today: todayFn(), lastClientId: data.settings.lastUsed?.clientId, lastProductId: data.settings.lastUsed?.productId, clientId }),
  );
  const [errors, setErrors] = useState<SaleFormErrors>({});
  const [paying, setPaying] = useState(false);

  const set = (patch: Partial<SaleFormState>) => setForm((p) => ({ ...p, ...patch }));
  const setLine = (key: string, patch: Partial<LineState>) => setForm((p) => ({ ...p, lines: p.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)) }));

  const clientOptions = useMemo(
    () =>
      data.clients
        .filter((c) => !c.archived || c.id === form.clientId)
        .map((c) => ({ value: c.id, label: c.name }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [data.clients, form.clientId],
  );
  const productOptions = useMemo(
    () =>
      data.products
        .filter((p) => !p.archived || form.lines.some((l) => l.productId === p.id))
        .map((p) => ({ value: p.id, label: p.name, ...(p.defaultPrice ? { hint: f.money(p.defaultPrice) } : {}) }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [data.products, form.lines, f],
  );

  const total = formTotal(form);
  const client = form.clientId ? derived.clientById.get(form.clientId) : undefined;
  const summary = form.clientId ? derived.clients.get(form.clientId) : undefined;
  const info = sale ? derived.sales.get(sale.id) : undefined;
  // Paid via FIFO (client payments without saleId) also blocks the toggle, else it would double-count.
  const showPaidToggle = !!form.clientId && canTogglePaid(sale, linked, sale?.clientId === form.clientId ? info?.paid : 0);
  const balance = summary?.outstanding ?? 0;

  const submit = () => {
    const e = validateSaleForm(form);
    setErrors(e);
    if (hasErrors(e)) return;
    const plan = buildSaleSave(form, { existing: sale, linked, products: data.products });
    actions.upsert('sales', plan.sale);
    for (const id of plan.removePaymentIds) actions.remove('payments', id);
    if (plan.upsertPayments.length) actions.upsertMany('payments', plan.upsertPayments);
    if (plan.productPriceUpdates.length) actions.upsertMany('products', plan.productPriceUpdates);
    const firstProduct = plan.sale.items[0]?.productId;
    actions.updateSettings({ lastUsed: { ...(plan.sale.clientId ? { clientId: plan.sale.clientId } : {}), ...(firstProduct ? { productId: firstProduct } : {}) } });
    toast.show(t('savedToast'), { tone: 'success' });
    onSaved?.(plan.sale);
    onClose();
  };

  const onDelete = async () => {
    if (!sale) return;
    const ok = await confirm({
      title: t('deleteSaleTitle'),
      message: linked.length ? t('deleteSaleWithPayments', { count: linked.length }) : tc('deleteMessage'),
      destructive: true,
      confirmLabel: tc('delete'),
    });
    if (!ok) return;
    for (const p of linked) actions.remove('payments', p.id);
    actions.remove('sales', sale.id);
    toast.show(t('deletedToast'));
    onClose();
  };

  const createProduct = (name: string) => {
    const id = newId();
    actions.upsert('products', { id, name: name.trim(), unit: t('newProductUnit'), defaultPrice: 0, archived: false });
    return id;
  };

  const lineErr = (key: string, field: 'productId' | 'quantity' | 'unitPrice') => {
    const e = errors.line?.[key]?.[field];
    return e ? tc(e) : undefined;
  };

  const canRecordPayment = !!sale && !!sale.clientId && sale.clientId === form.clientId && (info?.open ?? 0) > 0;

  return (
    <>
      <Sheet
        open
        onClose={onClose}
        title={sale ? t('editSale') : t('newSale')}
        onSubmit={submit}
        size="lg"
        className="sales-sheet"
        footer={
          sale ? (
            <>
              <Button variant="destructive" onClick={onDelete}>
                {t('deleteSale')}
              </Button>
              {canRecordPayment && (
                <Button variant="secondary" onClick={() => setPaying(true)}>
                  {t('recordPayment')}
                </Button>
              )}
            </>
          ) : undefined
        }
      >
        <div className="pf-form-section">
          <div className="sales-top">
            <Field label={tc('date')} error={errors.date && tc('required')}>
              <DateField value={form.date} onChange={(d) => set({ date: d })} />
            </Field>
            <Field
              label={tc('client')}
              optionalLabel={tc('optional')}
              hint={
                client
                  ? balance > 0
                    ? t('clientOpenBalance', { name: client.name, amount: f.money(balance) })
                    : balance < 0
                      ? t('clientCredit', { name: client.name, amount: f.money(-balance) })
                      : t('clientNoBalance', { name: client.name })
                  : t('clientHint')
              }
            >
              <Combobox
                value={form.clientId}
                onChange={(v) => set({ clientId: v })}
                options={clientOptions}
                placeholder={t('clientPlaceholder')}
                allowClear
                onCreate={(name) => {
                  const id = newId();
                  actions.upsert('clients', { id, name: name.trim(), archived: false });
                  return id;
                }}
              />
            </Field>
          </div>
        </div>

        <div className="pf-form-section">
          <div className="sales-lines">
            {form.lines.map((line, i) => {
              const product = line.productId ? derived.productById.get(line.productId) : undefined;
              const batches = line.productId
                ? data.batches
                    .filter((b) => b.productId === line.productId && (!b.closed || b.id === line.batchId))
                    .sort((a, b) => (a.producedOn < b.producedOn ? 1 : -1))
                    .map((b) => ({ value: b.id, label: b.code }))
                : [];
              const lt = lineStateTotal(line);
              return (
                <div className="sales-line" key={line.key}>
                  <div className="sales-line__head">
                    <Field label={`${tc('product')}${form.lines.length > 1 ? ` ${i + 1}` : ''}`} error={lineErr(line.key, 'productId')} className="sales-line__product">
                      <Combobox
                        value={line.productId}
                        onChange={(v) => setForm((p) => ({ ...p, lines: p.lines.map((l) => (l.key === line.key ? lineForProduct(data, v, { key: l.key, quantity: l.quantity }) : l)) }))}
                        options={productOptions}
                        placeholder={t('productPlaceholder')}
                        onCreate={createProduct}
                      />
                    </Field>
                    {form.lines.length > 1 && (
                      <Button
                        variant="plain"
                        size="sm"
                        className="sales-line__remove"
                        aria-label={t('removeLine')}
                        title={t('removeLine')}
                        onClick={() => setForm((p) => ({ ...p, lines: p.lines.filter((l) => l.key !== line.key) }))}
                      >
                        <Icon name="trash" size={18} />
                      </Button>
                    )}
                  </div>
                  <div className="pf-form-row sales-line__row">
                    {batches.length > 0 && (
                      <Field label={tc('batch')}>
                        <Select value={line.batchId ?? ''} onChange={(v) => setLine(line.key, { batchId: v || undefined })} options={batches} placeholder={t('noBatch')} />
                      </Field>
                    )}
                    <Field label={product ? `${tc('quantity')} (${product.unit})` : tc('quantity')} error={lineErr(line.key, 'quantity')}>
                      <TextInput inputMode="decimal" value={line.quantity} onChange={(e) => setLine(line.key, { quantity: e.target.value })} className="num" />
                    </Field>
                    <Field label={tc('unitPrice')} error={lineErr(line.key, 'unitPrice')}>
                      <MoneyInput value={line.unitPrice} onChange={(c) => setLine(line.key, { unitPrice: c })} />
                    </Field>
                  </div>
                  {form.lines.length > 1 && lt !== null && (
                    <div className="sales-line__total">
                      <span className="muted">{t('lineTotal')}</span> <Amount cents={lt} size="sm" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="sales-lines__footer">
            <Button variant="plain" icon={<Icon name="plus" size={16} />} onClick={() => setForm((p) => ({ ...p, lines: [...p.lines, lineForProduct(data, undefined)] }))}>
              {t('addLine')}
            </Button>
            <div className="sales-total" aria-live="polite">
              <span>{t('saleTotal')}</span>
              <Amount cents={total} size="lg" />
            </div>
          </div>
        </div>

        <div className="pf-form-section pf-stack sales-form">
          {!form.clientId ? (
            <p className="muted sales-note">{t('walkInPaid')}</p>
          ) : showPaidToggle ? (
            <Toggle checked={form.paid} onChange={(v) => set({ paid: v })} label={t('paidLabel')} description={t('paidHint')} />
          ) : (
            info && <p className="muted sales-note">{t('paymentsExist', { paid: f.money(info.paid), total: f.money(info.total) })}</p>
          )}
          {form.clientId && !(showPaidToggle && form.paid) && (
            <Field label={tc('dueDate')} optionalLabel={tc('optional')} hint={t('dueDateHint')}>
              <DateField value={form.dueDate} onChange={(d) => set({ dueDate: d })} />
            </Field>
          )}
          <Field label={tc('notes')} optionalLabel={tc('optional')}>
            <TextArea rows={2} value={form.notes} onChange={(e) => set({ notes: e.target.value })} />
          </Field>
        </div>
      </Sheet>
      {sale && <RecordPaymentSheet open={paying} onClose={() => setPaying(false)} clientId={sale.clientId} saleId={sale.id} />}
    </>
  );
}

export default SaleSheet;
