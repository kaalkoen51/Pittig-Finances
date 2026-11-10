import { useState } from 'react';
import type { Product } from '../../domain/types';
import { useT } from '../../i18n';
import { useActions, useData } from '../../state/store';
import { Button, Field, Icon, MoneyInput, Sheet, TextInput, useConfirm, useToast } from '../../ui';
import { isDuplicateProduct, productForm, productFromForm, type ProductFormState } from './batchLogic';

export interface ProductSheetProps {
  open: boolean;
  onClose: () => void;
  product?: Product;
  onSaved?: (p: Product) => void;
}

export function ProductSheet(props: ProductSheetProps) {
  if (!props.open) return null;
  return <ProductSheetInner {...props} />;
}

function ProductSheetInner({ onClose, product, onSaved }: ProductSheetProps) {
  const t = useT('batches');
  const tc = useT('common');
  const data = useData();
  const actions = useActions();
  const toast = useToast();
  const confirm = useConfirm();
  const defaultUnit = t('defaultUnit');
  const [form, setForm] = useState<ProductFormState>(() => productForm(product, defaultUnit));
  const [submitted, setSubmitted] = useState(false);
  const set = (patch: Partial<ProductFormState>) => setForm((f) => ({ ...f, ...patch }));

  const duplicate = isDuplicateProduct(data.products, form.name, product?.id);
  const nameError = submitted && !form.name.trim() ? tc('required') : duplicate ? t('productExists') : undefined;
  const referenced = product ? actions.isReferenced('products', product.id) : false;

  const submit = () => {
    setSubmitted(true);
    if (!form.name.trim() || duplicate) return;
    const saved = productFromForm(form, product, defaultUnit);
    actions.upsert('products', saved);
    toast.show(tc('savedToast'), { tone: 'success' });
    onSaved?.(saved);
    onClose();
  };

  const toggleArchive = () => {
    if (!product) return;
    actions.archive('products', product.id, !product.archived);
    toast.show(product.archived ? tc('savedToast') : tc('archivedToast'));
    onClose();
  };

  const remove = async () => {
    if (!product) return;
    if (!(await confirm({ title: t('deleteProductTitle', { name: product.name }), message: tc('deleteMessage'), destructive: true, confirmLabel: tc('delete') }))) return;
    if (actions.remove('products', product.id)) {
      onClose();
      toast.show(tc('deletedToast'));
    }
  };

  const footer = product ? (
    <div className="pf-stack">
      {(referenced || product.archived) && (
        <Button variant="secondary" icon={<Icon name="archive" />} onClick={toggleArchive}>
          {product.archived ? tc('unarchive') : tc('archive')}
        </Button>
      )}
      {referenced ? (
        !product.archived && <p className="muted batches-hint">{t('productInUse')}</p>
      ) : (
        <Button variant="destructive" icon={<Icon name="trash" />} onClick={remove}>
          {tc('delete')}
        </Button>
      )}
    </div>
  ) : undefined;

  return (
    <Sheet open onClose={onClose} title={product ? t('editProductTitle') : t('addProductTitle')} onSubmit={submit} footer={footer} className="batches-sheet">
      <div className="pf-form-section">
        <Field label={tc('name')} error={nameError}>
          <TextInput value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder={t('namePlaceholder')} data-autofocus />
        </Field>
        <div className="pf-form-row">
          <Field label={t('unit')} hint={t('unitHint')}>
            <TextInput value={form.unit} onChange={(e) => set({ unit: e.target.value })} placeholder={t('unitPlaceholder')} />
          </Field>
          <Field label={t('defaultPrice')} hint={t('defaultPriceHint')} optionalLabel={tc('optional')}>
            <MoneyInput value={form.defaultPrice} onChange={(defaultPrice) => set({ defaultPrice })} />
          </Field>
        </div>
      </div>
    </Sheet>
  );
}
