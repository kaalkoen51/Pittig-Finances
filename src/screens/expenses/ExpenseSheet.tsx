/**
 * Add/edit expense sheet. Reused by Suppliers (prefilled supplier) and Batches ("Add cost to this
 * batch", prefilled batch). Mount it with `open`; state is fresh every time it opens.
 */
import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { today as todayFn } from '../../domain/dates';
import { newId } from '../../domain/ids';
import type { Expense, ISODate, Id } from '../../domain/types';
import { useT } from '../../i18n';
import { useActions, useData } from '../../state/store';
import { Button, Chips, Combobox, DateField, Field, Icon, MoneyInput, Sheet, TextInput, Toggle, useConfirm, useFieldProps, useToast } from '../../ui';
import {
  batchOptionGroups,
  defaultDueDate,
  expenseFromForm,
  findOrMakeCategory,
  formFromExpense,
  newExpenseForm,
  supplierForCategory,
  validateExpenseForm,
  type ExpenseDefaults,
  type ExpenseFormState,
} from './expenseForm';
import './expenses.css';

export interface ExpenseSheetProps {
  open: boolean;
  onClose: () => void;
  /** Edit this expense; omitted = new expense. */
  expense?: Expense;
  /** Prefill for a new expense (e.g. batchId from the batch screen). */
  defaults?: ExpenseDefaults;
  /** Override the sheet title. */
  title?: string;
  onSaved?: (e: Expense) => void;
  /** Injected for tests. */
  today?: ISODate;
}

export function ExpenseSheet(props: ExpenseSheetProps) {
  if (!props.open) return null;
  return <ExpenseSheetInner {...props} />;
}

function ExpenseSheetInner({ onClose, expense, defaults, title, onSaved, today: todayProp }: ExpenseSheetProps) {
  const t = useT('expenses');
  const tc = useT('common');
  const data = useData();
  const actions = useActions();
  const toast = useToast();
  const confirm = useConfirm();
  const today = todayProp ?? todayFn();

  const [form, setForm] = useState<ExpenseFormState>(() => {
    if (expense) return formFromExpense(expense);
    const lastCat = data.settings.lastUsed?.categoryId;
    const validLast = lastCat && data.categories.some((c) => c.id === lastCat && !c.archived) ? lastCat : undefined;
    const categoryId = defaults?.categoryId ?? validLast;
    const supplierId = defaults?.supplierId ?? supplierForCategory(data.expenses, categoryId);
    return newExpenseForm(today, { ...defaults, categoryId, supplierId });
  });
  const [submitted, setSubmitted] = useState(false);
  const supplierTouched = useRef(!!expense || !!defaults?.supplierId);
  const dueTouched = useRef(!!expense?.dueDate);
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

  const set = (patch: Partial<ExpenseFormState>) => setForm((f) => ({ ...f, ...patch }));
  const errors = submitted ? validateExpenseForm(form) : {};
  const errText = (e: string | undefined) => (e === 'required' ? tc('required') : e === 'invalidAmount' ? tc('invalidAmount') : undefined);

  const categoryOptions = useMemo(
    () =>
      data.categories
        .filter((c) => !c.archived || c.id === form.categoryId)
        .map((c) => ({ value: c.id, label: c.name, color: c.color })),
    [data.categories, form.categoryId],
  );

  const supplierOptions = useMemo(
    () =>
      data.suppliers
        .filter((s) => !s.archived || s.id === form.supplierId)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((s) => ({ value: s.id, label: s.name })),
    [data.suppliers, form.supplierId],
  );

  const batchGroups = useMemo(() => batchOptionGroups(data, form.batchId, t('closedSuffix')), [data, form.batchId, t]);

  const pickCategory = (categoryId: Id | undefined) => {
    const patch: Partial<ExpenseFormState> = { categoryId };
    if (!supplierTouched.current) patch.supplierId = supplierForCategory(data.expenses, categoryId);
    set(patch);
  };

  const createCategory = () => {
    const name = newCategoryName.trim();
    if (!name) return;
    const { category, created } = findOrMakeCategory(data.categories, name);
    if (created) actions.upsert('categories', category);
    else if (category.archived) actions.archive('categories', category.id, false);
    pickCategory(category.id);
    setAddingCategory(false);
    setNewCategoryName('');
  };

  const onNewCategoryKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      createCategory();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setAddingCategory(false);
      setNewCategoryName('');
    }
  };

  const createSupplier = (name: string): Id => {
    const id = newId();
    actions.upsert('suppliers', { id, name: name.trim(), archived: false });
    return id;
  };

  const setDate = (date: ISODate | undefined) => {
    const patch: Partial<ExpenseFormState> = { date };
    if (date && !form.paid && !dueTouched.current) patch.dueDate = defaultDueDate(date);
    set(patch);
  };

  const setPaid = (paid: boolean) => {
    const patch: Partial<ExpenseFormState> = { paid };
    if (!paid && !form.dueDate) patch.dueDate = defaultDueDate(form.date ?? today);
    set(patch);
  };

  const submit = () => {
    setSubmitted(true);
    if (Object.keys(validateExpenseForm(form)).length) return;
    const saved = expenseFromForm(form, expense);
    actions.upsert('expenses', saved);
    if (!expense) actions.updateSettings({ lastUsed: { categoryId: saved.categoryId, ...(saved.supplierId ? { supplierId: saved.supplierId } : {}) } });
    toast.show(t('savedToast'), { tone: 'success' });
    onSaved?.(saved);
    onClose();
  };

  const remove = async () => {
    if (!expense) return;
    if (!(await confirm({ title: t('deleteTitle'), message: tc('deleteMessage'), destructive: true, confirmLabel: tc('delete') }))) return;
    // Undo also re-links the bank import row that this expense was sorted from.
    const undo = actions.removeWithUndo('expenses', expense.id);
    onClose();
    toast.show(t('deletedToast'), undo ? { action: { label: tc('undo'), onClick: undo } } : undefined);
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={title ?? (expense ? t('editTitle') : t('addTitle'))}
      onSubmit={submit}
      className="expenses-sheet"
      footer={
        expense ? (
          <Button variant="destructive" icon={<Icon name="trash" />} onClick={remove}>
            {t('deleteButton')}
          </Button>
        ) : undefined
      }
    >
      <div className="pf-form-section">
        <Field label={tc('amount')} error={errText(errors.amount)} className="expenses-amount-field">
          <MoneyInput value={form.amount} onChange={(amount) => set({ amount })} data-autofocus className="expenses-amount" />
        </Field>
        <Field label={tc('date')} error={errText(errors.date)}>
          <DateField value={form.date} onChange={setDate} />
        </Field>
        <Field label={tc('description')} optionalLabel={tc('optional')}>
          <TextInput value={form.description} onChange={(e) => set({ description: e.target.value })} placeholder={t('descriptionPlaceholder')} />
        </Field>
      </div>

      <div className="pf-form-section">
        <div className={`pf-field${errors.category ? ' pf-field--error' : ''}`}>
          <div className="pf-field__label">
            {tc('category')}
          </div>
          <Chips
            aria-label={tc('category')}
            options={categoryOptions}
            value={form.categoryId}
            onChange={pickCategory}
            trailing={
              addingCategory ? (
                <span className="expenses-newcat">
                  <input
                    className="pf-input expenses-newcat__input"
                    aria-label={t('newCategoryLabel')}
                    placeholder={t('newCategoryPlaceholder')}
                    value={newCategoryName}
                    autoFocus
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    onKeyDown={onNewCategoryKey}
                  />
                  <Button size="sm" variant="secondary" onClick={createCategory} disabled={!newCategoryName.trim()}>
                    {t('addCategory')}
                  </Button>
                </span>
              ) : (
                <button type="button" className="pf-chip expenses-newcat__chip" onClick={() => setAddingCategory(true)}>
                  <Icon name="plus" size={14} />
                  {t('newCategory')}
                </button>
              )
            }
          />
          {errors.category && (
            <div className="pf-field__error" role="alert">
              {tc('required')}
            </div>
          )}
        </div>
      </div>

      <div className="pf-form-section">
        <Field label={tc('supplier')} optionalLabel={tc('optional')}>
          <Combobox
            value={form.supplierId}
            onChange={(supplierId) => {
              supplierTouched.current = true;
              set({ supplierId });
            }}
            options={supplierOptions}
            onCreate={createSupplier}
            allowClear
            placeholder={t('supplierPlaceholder')}
          />
        </Field>
        <Field label={t('batchLabel')} hint={t('batchHint')}>
          <BatchSelect value={form.batchId} onChange={(batchId) => set({ batchId })} groups={batchGroups} generalLabel={t('generalCost')} />
        </Field>
      </div>

      <div className="pf-form-section">
        <Toggle checked={form.paid} onChange={setPaid} label={tc('paidAlready')} description={form.paid ? t('paidHint') : t('unpaidHint')} />
        {!form.paid && (
          <Field label={tc('dueDate')} hint={t('dueHint')} error={errText(errors.dueDate)}>
            <DateField
              value={form.dueDate}
              onChange={(dueDate) => {
                dueTouched.current = true;
                set({ dueDate });
              }}
            />
          </Field>
        )}
        <Toggle checked={form.refund} onChange={(refund) => set({ refund })} label={tc('refund')} description={t('refundHint')} />
      </div>
    </Sheet>
  );
}

function BatchSelect({
  value,
  onChange,
  groups,
  generalLabel,
}: {
  value: Id | undefined;
  onChange: (v: Id | undefined) => void;
  groups: ReturnType<typeof batchOptionGroups>;
  generalLabel: string;
}) {
  const f = useFieldProps();
  return (
    <select className="pf-input pf-select" value={value ?? ''} onChange={(e) => onChange(e.target.value || undefined)} {...f}>
      <option value="">{generalLabel}</option>
      {groups.map((g) => (
        <optgroup key={g.productId} label={g.label}>
          {g.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
