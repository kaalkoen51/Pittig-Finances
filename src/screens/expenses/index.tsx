import { useEffect, useMemo, useState } from 'react';
import type { Expense } from '../../domain/types';
import { useFormat, useT } from '../../i18n';
import { navigate, useRoute } from '../../router';
import { useData, useDerived } from '../../state/store';
import { Amount, Badge, Button, Chips, EmptyState, Icon, List, ListRow, PageHeader, SearchField, Segmented } from '../../ui';
import { ExpenseSheet } from './ExpenseSheet';
import { expenseStatus, filterExpenses, groupByMonth } from './expenseList';
import './expenses.css';

type SheetState = { mode: 'new' } | { mode: 'edit'; expense: Expense } | null;

export default function ExpensesScreen() {
  const t = useT('expenses');
  const tc = useT('common');
  const f = useFormat();
  const data = useData();
  const derived = useDerived();
  const { query } = useRoute();

  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState<string | undefined>();
  const [show, setShow] = useState<'all' | 'unpaid'>('all');
  const [sheet, setSheet] = useState<SheetState>(null);

  // #/expenses?new=1 (from Overview "+ Expense") opens the add sheet once.
  // #/expenses?edit=<id> (from Overview recent activity) opens that expense.
  const wantsNew = query.get('new') === '1';
  const editId = query.get('edit');
  useEffect(() => {
    if (!wantsNew && !editId) return;
    const target = editId ? data.expenses.find((e) => e.id === editId) : undefined;
    if (target) setSheet({ mode: 'edit', expense: target });
    else if (wantsNew) setSheet({ mode: 'new' });
    navigate('/expenses', { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to the URL
  }, [wantsNew, editId]);

  const filtered = useMemo(
    () =>
      filterExpenses(data.expenses, { query: search, categoryId, unpaidOnly: show === 'unpaid' }, {
        categoryById: derived.categoryById,
        supplierById: derived.supplierById,
        batchById: derived.batchById,
      }),
    [data.expenses, search, categoryId, show, derived],
  );
  const groups = useMemo(() => groupByMonth(filtered), [filtered]);
  const unpaidCount = useMemo(() => data.expenses.filter((e) => e.paidOn === null).length, [data.expenses]);

  const usedCategoryIds = useMemo(() => new Set(data.expenses.map((e) => e.categoryId)), [data.expenses]);
  const categoryChips = data.categories
    .filter((c) => usedCategoryIds.has(c.id) || c.id === categoryId)
    .map((c) => ({ value: c.id, label: c.name, color: c.color }));

  const filtersActive = !!search || !!categoryId || show === 'unpaid';
  const addButton = (
    <Button variant="primary" icon={<Icon name="plus" />} onClick={() => setSheet({ mode: 'new' })}>
      {t('add')}
    </Button>
  );

  return (
    <>
      <PageHeader title={t('title')} action={addButton}>
        {data.expenses.length > 0 && (
          <div className="expenses-toolbar">
            <div className="expenses-toolbar__row">
              <SearchField value={search} onChange={setSearch} placeholder={t('searchPlaceholder')} aria-label={tc('search')} className="expenses-toolbar__search" />
              <Segmented
                aria-label={t('filterLabel')}
                size="sm"
                value={show}
                onChange={setShow}
                options={[
                  { value: 'all', label: t('filterAll') },
                  { value: 'unpaid', label: unpaidCount ? `${t('filterUnpaid')} · ${unpaidCount}` : t('filterUnpaid') },
                ]}
              />
            </div>
            {categoryChips.length > 1 && (
              <Chips aria-label={t('categoryFilterLabel')} options={categoryChips} value={categoryId} onChange={setCategoryId} allowDeselect className="expenses-toolbar__chips" />
            )}
          </div>
        )}
      </PageHeader>

      {data.expenses.length === 0 ? (
        <EmptyState
          icon="expenses"
          title={t('emptyTitle')}
          message={t('emptyMessage')}
          action={
            <Button variant="primary" icon={<Icon name="plus" />} onClick={() => setSheet({ mode: 'new' })}>
              {t('emptyAction')}
            </Button>
          }
        />
      ) : groups.length === 0 ? (
        <EmptyState
          icon="search"
          title={t('noMatchTitle')}
          message={t('noMatchMessage')}
          action={
            filtersActive ? (
              <Button
                onClick={() => {
                  setSearch('');
                  setCategoryId(undefined);
                  setShow('all');
                }}
              >
                {t('clearFilters')}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="pf-stack pf-stack--lg">
          {groups.map((g) => (
            <List
              key={g.month}
              header={
                <span className="expenses-month">
                  <span className="expenses-month__name">{f.month(g.month)}</span>
                  <span className="expenses-month__total num">{f.money(g.total)}</span>
                </span>
              }
            >
              {g.expenses.map((e) => {
                const cat = derived.categoryById.get(e.categoryId);
                const supplier = e.supplierId ? derived.supplierById.get(e.supplierId) : undefined;
                const batch = e.batchId ? derived.batchById.get(e.batchId) : undefined;
                const status = expenseStatus(e, derived.today);
                const sub = [f.date(e.date, 'short'), supplier?.name, cat && e.description ? cat.name : undefined].filter(Boolean).join(' · ');
                return (
                  <ListRow
                    key={e.id}
                    onClick={() => setSheet({ mode: 'edit', expense: e })}
                    leading={<span className="expenses-dot" style={{ background: cat?.color ?? 'var(--label-3)' }} aria-hidden="true" />}
                    title={e.description || cat?.name || '—'}
                    subtitle={
                      <>
                        {sub}
                        {batch && <span className="expenses-batch-tag">{batch.code}</span>}
                      </>
                    }
                    detail={
                      <span className="expenses-detail">
                        <Amount cents={e.amount} tone={e.amount < 0 ? 'in' : 'out'} />
                        {status === 'overdue' ? (
                          <Badge tone="danger">{tc('overdue')}</Badge>
                        ) : status === 'unpaid' ? (
                          <Badge tone="warning">{t('unpaid')}</Badge>
                        ) : e.amount < 0 ? (
                          <Badge tone="success">{t('refundBadge')}</Badge>
                        ) : null}
                      </span>
                    }
                  />
                );
              })}
            </List>
          ))}
        </div>
      )}

      <ExpenseSheet
        key={sheet?.mode === 'edit' ? sheet.expense.id : 'new'}
        open={sheet !== null}
        expense={sheet?.mode === 'edit' ? sheet.expense : undefined}
        defaults={categoryId && sheet?.mode === 'new' ? { categoryId } : undefined}
        onClose={() => setSheet(null)}
      />
    </>
  );
}
