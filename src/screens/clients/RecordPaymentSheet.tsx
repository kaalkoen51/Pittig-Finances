/**
 * Reusable "Record payment" sheet (money in from a client). Other screens may import it:
 *   <RecordPaymentSheet open onClose={…} clientId="…" saleId="…" />
 * Pass `payment` to edit an existing one (shows Delete).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { saleTotal } from '../../domain/calc';
import { today as todayFn } from '../../domain/dates';
import { newId } from '../../domain/ids';
import type { Id, Payment, PaymentMethod } from '../../domain/types';
import { useFormat, useT } from '../../i18n';
import { useActions, useData, useDerived } from '../../state/store';
import { Button, Combobox, DateField, Field, MoneyInput, Segmented, Select, Sheet, TextInput, Toggle, useConfirm, useToast } from '../../ui';
import './clients.css';
import { buildPayment, paymentToForm, suggestedAmount, validatePaymentForm, type PaymentFormErrors, type PaymentFormState } from './paymentForm';

export interface RecordPaymentSheetProps {
  open: boolean;
  onClose: () => void;
  clientId?: Id;
  saleId?: Id;
  /** Edit this payment instead of creating a new one. */
  payment?: Payment;
  onSaved?: (p: Payment) => void;
}

export function RecordPaymentSheet(props: RecordPaymentSheetProps) {
  if (!props.open) return null;
  return <PaymentSheetInner {...props} />;
}

function PaymentSheetInner({ onClose, clientId, saleId, payment, onSaved }: RecordPaymentSheetProps) {
  const t = useT('clients');
  const tc = useT('common');
  const f = useFormat();
  const data = useData();
  const derived = useDerived();
  const { upsert, remove } = useActions();
  const toast = useToast();
  const confirm = useConfirm();

  const initialClient = payment?.clientId ?? clientId ?? (saleId ? derived.saleById.get(saleId)?.clientId : undefined);
  const [form, setForm] = useState<PaymentFormState>(() =>
    payment
      ? paymentToForm(payment)
      : {
          ...(initialClient ? { clientId: initialClient } : {}),
          ...(saleId ? { saleId } : {}),
          amount: suggestedAmount({ saleId, sales: derived.sales, outstanding: initialClient ? derived.clients.get(initialClient)?.outstanding : undefined }),
          date: todayFn(),
          method: 'bank',
          refund: false,
          notes: '',
        },
  );
  const [initial] = useState(form);
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  const [errors, setErrors] = useState<PaymentFormErrors>({});
  const amountTouched = useRef(!!payment);

  const set = (patch: Partial<PaymentFormState>) => setForm((prev) => ({ ...prev, ...patch }));

  // Re-suggest the amount when the client or sale changes, as long as the user did not type one.
  useEffect(() => {
    if (amountTouched.current) return;
    set({ amount: suggestedAmount({ saleId: form.saleId, sales: derived.sales, outstanding: form.clientId ? derived.clients.get(form.clientId)?.outstanding : undefined }) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.clientId, form.saleId]);

  const clientOptions = useMemo(
    () =>
      data.clients
        .filter((c) => !c.archived || c.id === form.clientId)
        .map((c) => {
          const out = derived.clients.get(c.id)?.outstanding ?? 0;
          return { value: c.id, label: c.name, ...(out > 0 ? { hint: f.money(out) } : {}) };
        })
        .sort((a, b) => a.label.localeCompare(b.label)),
    [data.clients, derived.clients, form.clientId, f],
  );

  const saleOptions = useMemo(() => {
    if (!form.clientId) return [];
    return data.sales
      .filter((s) => s.clientId === form.clientId)
      .filter((s) => (derived.sales.get(s.id)?.open ?? 0) > 0 || s.id === form.saleId)
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .map((s) => {
        const open = derived.sales.get(s.id)?.open ?? 0;
        return {
          value: s.id,
          label: open > 0 ? t('saleOption', { date: f.date(s.date, 'short'), amount: f.money(open) }) : t('saleOptionPaid', { date: f.date(s.date, 'short'), amount: f.money(saleTotal(s)) }),
        };
      });
  }, [data.sales, derived.sales, form.clientId, form.saleId, f, t]);

  const outstanding = form.clientId ? (derived.clients.get(form.clientId)?.outstanding ?? 0) : 0;
  const openHint = form.saleId ? (derived.sales.get(form.saleId)?.open ?? 0) : outstanding;

  const submit = () => {
    const e = validatePaymentForm(form);
    setErrors(e);
    if (Object.keys(e).length) return;
    const p = buildPayment(form, payment);
    upsert('payments', p);
    toast.show(t('paymentSaved'), { tone: 'success' });
    onSaved?.(p);
    onClose();
  };

  const onDelete = async () => {
    if (!payment) return;
    if (!(await confirm({ title: t('deletePaymentTitle'), message: tc('deleteMessage'), destructive: true, confirmLabel: tc('delete') }))) return;
    remove('payments', payment.id);
    toast.show(t('paymentDeleted'));
    onClose();
  };

  const methods: { value: PaymentMethod; label: string }[] = [
    { value: 'bank', label: tc('methodBank') },
    { value: 'cash', label: tc('methodCash') },
    { value: 'card', label: tc('methodCard') },
    { value: 'other', label: tc('methodOther') },
  ];

  return (
    <Sheet
      open
      onClose={onClose}
      title={payment ? t('editPaymentTitle') : t('paymentTitle')}
      onSubmit={submit}
      dirty={dirty}
      footer={
        payment ? (
          <Button variant="destructive" onClick={onDelete}>
            {t('deletePayment')}
          </Button>
        ) : undefined
      }
    >
      <div className="pf-form-section pf-stack clients-form">
        <Field label={tc('client')} error={errors.clientId && tc('required')}>
          <Combobox
            value={form.clientId}
            onChange={(v) => set({ clientId: v, saleId: undefined })}
            options={clientOptions}
            placeholder={t('clientPlaceholder')}
            onCreate={(name) => {
              const id = newId();
              upsert('clients', { id, name: name.trim(), archived: false });
              return id;
            }}
          />
        </Field>
        <Field
          label={tc('amount')}
          error={errors.amount && tc(errors.amount)}
          hint={!form.refund && openHint > 0 ? t('amountHintOpen', { amount: f.money(openHint) }) : undefined}
        >
          <MoneyInput
            value={form.amount}
            data-autofocus={form.clientId ? '' : undefined}
            onChange={(c) => {
              amountTouched.current = true;
              set({ amount: c });
            }}
          />
        </Field>
        <Field label={tc('date')} error={errors.date && tc('required')}>
          <DateField value={form.date} onChange={(d) => set({ date: d })} />
        </Field>
      </div>
      <div className="pf-form-section pf-stack clients-form">
        {saleOptions.length > 0 && (
          <Field label={t('forSale')} optionalLabel={tc('optional')} hint={form.saleId ? undefined : t('saleHint')}>
            <Select value={form.saleId ?? ''} onChange={(v) => set({ saleId: v || undefined })} options={saleOptions} placeholder={t('anySale')} />
          </Field>
        )}
        <Field label={tc('method')}>
          <Segmented aria-label={tc('method')} options={methods} value={form.method} onChange={(m) => set({ method: m })} block size="sm" />
        </Field>
        <Toggle checked={form.refund} onChange={(v) => set({ refund: v })} label={t('refundLabel')} description={t('refundHint')} />
        <Field label={tc('notes')} optionalLabel={tc('optional')}>
          <TextInput value={form.notes} onChange={(e) => set({ notes: e.target.value })} />
        </Field>
      </div>
    </Sheet>
  );
}

export default RecordPaymentSheet;
