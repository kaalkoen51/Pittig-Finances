import { useMemo, useState } from 'react';
import { today as todayFn } from '../../domain/dates';
import type { Batch, ISODate, Id } from '../../domain/types';
import { useT } from '../../i18n';
import { navigate } from '../../router';
import { useActions, useData } from '../../state/store';
import { Button, DateField, Field, Icon, Select, Sheet, TextArea, TextInput, useConfirm, useToast } from '../../ui';
import { batchForm, batchFromForm, siblingCodes, suggestBatchCode, validateBatchForm, type BatchFormState } from './batchLogic';

export interface BatchSheetProps {
  open: boolean;
  onClose: () => void;
  batch?: Batch;
  defaultProductId?: Id;
  onSaved?: (b: Batch) => void;
  today?: ISODate;
}

export function BatchSheet(props: BatchSheetProps) {
  if (!props.open) return null;
  return <BatchSheetInner {...props} />;
}

function BatchSheetInner({ onClose, batch, defaultProductId, onSaved, today: todayProp }: BatchSheetProps) {
  const t = useT('batches');
  const tc = useT('common');
  const data = useData();
  const actions = useActions();
  const toast = useToast();
  const confirm = useConfirm();
  const today = todayProp ?? todayFn();

  const activeProducts = data.products.filter((p) => !p.archived || p.id === batch?.productId);
  const suggest = (f: Pick<BatchFormState, 'productId' | 'producedOn'>) => {
    const p = data.products.find((x) => x.id === f.productId);
    return p && f.producedOn ? suggestBatchCode(p.name, f.producedOn, siblingCodes(data.batches, p.id, batch?.id)) : '';
  };

  const [form, setForm] = useState<BatchFormState>(() => {
    if (batch) return batchForm(batch);
    const productId = defaultProductId ?? (activeProducts.length === 1 ? activeProducts[0]!.id : undefined);
    const f = batchForm(undefined, { productId, producedOn: today });
    return { ...f, code: suggest(f) };
  });
  const [codeTouched, setCodeTouched] = useState(!!batch);
  const [submitted, setSubmitted] = useState(false);

  const update = (patch: Partial<BatchFormState>) =>
    setForm((f) => {
      const next = { ...f, ...patch };
      if (!codeTouched && ('productId' in patch || 'producedOn' in patch)) next.code = suggest(next);
      return next;
    });

  const codes = useMemo(() => siblingCodes(data.batches, form.productId, batch?.id), [data.batches, form.productId, batch?.id]);
  const allErrors = validateBatchForm(form, codes);
  const errors = submitted ? allErrors : allErrors.code === 'codeExists' ? { code: allErrors.code } : {};
  const errText = (k: keyof typeof errors) => {
    const e = errors[k];
    return e === 'required' ? tc('required') : e === 'invalidQuantity' ? t('invalidQuantity') : e === 'codeExists' ? t('codeExists') : undefined;
  };
  const product = data.products.find((p) => p.id === form.productId);
  const referenced = batch ? actions.isReferenced('batches', batch.id) : false;

  const submit = () => {
    setSubmitted(true);
    if (Object.keys(allErrors).length) return;
    const saved = batchFromForm(form, batch);
    actions.upsert('batches', saved);
    actions.updateSettings({ lastUsed: { productId: saved.productId } });
    toast.show(tc('savedToast'), { tone: 'success' });
    onSaved?.(saved);
    onClose();
  };

  const toggleClosed = () => {
    if (!batch) return;
    actions.archive('batches', batch.id, !batch.closed);
    toast.show(batch.closed ? t('reopenedToast') : t('closedToast'));
    onClose();
  };

  const remove = async () => {
    if (!batch) return;
    if (!(await confirm({ title: t('deleteBatchTitle', { code: batch.code }), message: tc('deleteMessage'), destructive: true, confirmLabel: tc('delete') }))) return;
    if (actions.remove('batches', batch.id)) {
      onClose();
      toast.show(tc('deletedToast'));
      navigate('/batches', { replace: true });
    }
  };

  const footer = batch ? (
    <div className="pf-stack">
      <Button variant="secondary" icon={<Icon name={batch.closed ? 'refresh' : 'archive'} />} onClick={toggleClosed}>
        {batch.closed ? t('reopenBatch') : t('closeBatch')}
      </Button>
      {referenced ? (
        <p className="muted batches-hint">{t('batchInUse')}</p>
      ) : (
        <Button variant="destructive" icon={<Icon name="trash" />} onClick={remove}>
          {tc('delete')}
        </Button>
      )}
    </div>
  ) : undefined;

  return (
    <Sheet open onClose={onClose} title={batch ? t('editTitle') : t('addTitle')} onSubmit={submit} footer={footer} className="batches-sheet">
      <div className="pf-form-section">
        <Field label={tc('product')} error={errText('productId')} hint={activeProducts.length === 0 ? t('noProductsForBatch') : undefined}>
          <Select
            value={form.productId ?? ''}
            onChange={(v) => update({ productId: v || undefined })}
            options={activeProducts.map((p) => ({ value: p.id, label: p.name }))}
            placeholder={form.productId ? undefined : '—'}
          />
        </Field>
        <div className="pf-form-row">
          <Field label={t('produced')} error={errText('producedOn')}>
            <DateField value={form.producedOn} onChange={(producedOn) => update({ producedOn })} />
          </Field>
          <Field label={t('quantityProduced')} error={errText('quantity')} hint={product ? t('quantityHint', { unit: product.unit }) : undefined}>
            <TextInput inputMode="numeric" className="num" value={form.quantity} onChange={(e) => update({ quantity: e.target.value })} data-autofocus={batch ? undefined : true} />
          </Field>
        </div>
        <Field label={t('code')} error={errText('code')} hint={codeTouched ? undefined : t('codeHint')}>
          <TextInput
            value={form.code}
            onChange={(e) => {
              setCodeTouched(true);
              setForm((f) => ({ ...f, code: e.target.value }));
            }}
          />
        </Field>
        <Field label={tc('notes')} optionalLabel={tc('optional')}>
          <TextArea value={form.notes} onChange={(e) => update({ notes: e.target.value })} rows={2} placeholder={t('notesPlaceholder')} />
        </Field>
      </div>
    </Sheet>
  );
}
