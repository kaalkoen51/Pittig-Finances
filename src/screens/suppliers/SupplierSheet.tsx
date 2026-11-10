import { useState } from 'react';
import type { Supplier } from '../../domain/types';
import { useT } from '../../i18n';
import { navigate } from '../../router';
import { useActions, useData } from '../../state/store';
import { Button, Field, Icon, Sheet, TextArea, TextInput, useConfirm, useToast } from '../../ui';
import { isDuplicateName, supplierForm, supplierFromForm, type SupplierFormState } from './supplierLogic';

export interface SupplierSheetProps {
  open: boolean;
  onClose: () => void;
  supplier?: Supplier;
  onSaved?: (s: Supplier) => void;
}

export function SupplierSheet(props: SupplierSheetProps) {
  if (!props.open) return null;
  return <SupplierSheetInner {...props} />;
}

function SupplierSheetInner({ onClose, supplier, onSaved }: SupplierSheetProps) {
  const t = useT('suppliers');
  const tc = useT('common');
  const data = useData();
  const actions = useActions();
  const toast = useToast();
  const confirm = useConfirm();
  const [form, setForm] = useState<SupplierFormState>(() => supplierForm(supplier));
  const [submitted, setSubmitted] = useState(false);
  const set = (patch: Partial<SupplierFormState>) => setForm((f) => ({ ...f, ...patch }));

  const duplicate = isDuplicateName(data.suppliers, form.name, supplier?.id);
  const nameError = submitted && !form.name.trim() ? tc('required') : duplicate ? t('nameExists') : undefined;
  const referenced = supplier ? actions.isReferenced('suppliers', supplier.id) : false;

  const submit = () => {
    setSubmitted(true);
    if (!form.name.trim() || duplicate) return;
    const saved = supplierFromForm(form, supplier);
    actions.upsert('suppliers', saved);
    toast.show(tc('savedToast'), { tone: 'success' });
    onSaved?.(saved);
    onClose();
  };

  const remove = async () => {
    if (!supplier) return;
    if (!(await confirm({ title: t('deleteTitle', { name: supplier.name }), message: tc('deleteMessage'), destructive: true, confirmLabel: tc('delete') }))) return;
    if (actions.remove('suppliers', supplier.id)) {
      onClose();
      toast.show(tc('deletedToast'));
      navigate('/suppliers', { replace: true });
    }
  };

  const toggleArchive = () => {
    if (!supplier) return;
    actions.archive('suppliers', supplier.id, !supplier.archived);
    toast.show(supplier.archived ? tc('savedToast') : tc('archivedToast'));
    onClose();
  };

  const footer = supplier ? (
    referenced || supplier.archived ? (
      <div className="pf-stack">
        <Button variant="secondary" icon={<Icon name="archive" />} onClick={toggleArchive}>
          {supplier.archived ? tc('unarchive') : tc('archive')}
        </Button>
        {referenced && !supplier.archived && <p className="muted suppliers-hint">{t('archiveHint')}</p>}
        {!referenced && (
          <Button variant="destructive" icon={<Icon name="trash" />} onClick={remove}>
            {tc('delete')}
          </Button>
        )}
      </div>
    ) : (
      <Button variant="destructive" icon={<Icon name="trash" />} onClick={remove}>
        {tc('delete')}
      </Button>
    )
  ) : undefined;

  return (
    <Sheet open onClose={onClose} title={supplier ? t('editTitle') : t('addTitle')} onSubmit={submit} footer={footer} className="suppliers-sheet">
      <div className="pf-form-section">
        <Field label={tc('name')} error={nameError}>
          <TextInput value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder={t('namePlaceholder')} data-autofocus />
        </Field>
        <div className="pf-form-row">
          <Field label={tc('email')} optionalLabel={tc('optional')}>
            <TextInput type="email" value={form.email} onChange={(e) => set({ email: e.target.value })} />
          </Field>
          <Field label={tc('phone')} optionalLabel={tc('optional')}>
            <TextInput type="tel" value={form.phone} onChange={(e) => set({ phone: e.target.value })} />
          </Field>
        </div>
        <Field label={tc('notes')} optionalLabel={tc('optional')}>
          <TextArea value={form.notes} onChange={(e) => set({ notes: e.target.value })} rows={2} />
        </Field>
      </div>
    </Sheet>
  );
}
