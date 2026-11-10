import { useEffect, useMemo, useState } from 'react';
import type { Expense, Id, Supplier } from '../../domain/types';
import { useFormat, useT } from '../../i18n';
import { href, navigate, useMatch, useRoute } from '../../router';
import { useActions, useData, useDerived } from '../../state/store';
import { Amount, Badge, Button, Card, EmptyState, Icon, List, ListRow, PageHeader, Stat, useConfirm, useToast } from '../../ui';
import { ExpenseSheet } from '../expenses/ExpenseSheet';
import { SupplierSheet } from './SupplierSheet';
import { markPaid, supplierExpenses, supplierRows } from './supplierLogic';
import './suppliers.css';

/** Route id for "unpaid expenses without supplier". */
export const NO_SUPPLIER = '_none';

export default function SuppliersScreen() {
  const m = useMatch('/suppliers/:id');
  return m ? <SupplierDetail id={m.id!} /> : <SupplierList />;
}

function SupplierList() {
  const t = useT('suppliers');
  const tc = useT('common');
  const data = useData();
  const derived = useDerived();
  const { query } = useRoute();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const wantsNew = query.get('new') === '1';
  useEffect(() => {
    if (wantsNew) {
      setSheetOpen(true);
      navigate('/suppliers', { replace: true });
    }
  }, [wantsNew]);

  const rows = useMemo(() => supplierRows(data.suppliers, derived.supplierOwed), [data.suppliers, derived.supplierOwed]);
  const archivedRows = useMemo(
    () => supplierRows(data.suppliers.filter((s) => s.archived), []).filter((r) => !rows.some((x) => x.supplier.id === r.supplier.id)),
    [data.suppliers, rows],
  );
  const noSupplier = derived.supplierOwed.find((o) => o.supplierId === null);
  const overdueTotal = derived.supplierOwed.reduce((s, o) => s + o.overdueTotal, 0);
  const countText = (n: number) => (n === 1 ? t('owedCountOne') : t('owedCount', { count: n }));

  const addButton = (
    <Button variant="primary" icon={<Icon name="plus" />} onClick={() => setSheetOpen(true)}>
      {t('add')}
    </Button>
  );

  return (
    <>
      <PageHeader title={t('title')} subtitle={t('subtitle')} action={addButton} />
      <div className="pf-stack pf-stack--lg">
        <Card>
          {derived.youOwe !== 0 ? (
            <div className="suppliers-totals">
              <Stat label={t('totalOwed')} value={<Amount cents={derived.youOwe} size="xl" />} />
              {overdueTotal > 0 && <Stat label={t('overdueTotal')} value={<Amount cents={overdueTotal} size="xl" className="suppliers-overdue" />} />}
            </div>
          ) : (
            <p className="suppliers-allclear">
              <Icon name="check" size={20} /> {t('nothingOwed')}
            </p>
          )}
        </Card>

        {rows.length === 0 && !noSupplier ? (
          <EmptyState
            icon="suppliers"
            title={t('emptyTitle')}
            message={t('emptyMessage')}
            action={
              archivedRows.length === 0 ? undefined : (
                <Button variant="plain" onClick={() => setShowArchived((v) => !v)}>
                  {tc('showArchived')}
                </Button>
              )
            }
          />
        ) : (
          <List header={t('listHeader')}>
            {rows.map((r) => (
              <ListRow
                key={r.supplier.id}
                href={href('/suppliers/' + r.supplier.id)}
                title={r.supplier.name}
                muted={r.supplier.archived}
                subtitle={r.openCount ? countText(r.openCount) : r.supplier.email || r.supplier.phone || undefined}
                badge={r.overdue ? <Badge tone="danger">{tc('overdue')}</Badge> : r.supplier.archived ? <Badge>{tc('archived')}</Badge> : undefined}
                detail={r.owed !== 0 ? <Amount cents={r.owed} /> : <span className="muted">—</span>}
              />
            ))}
            {noSupplier && (
              <ListRow
                href={href('/suppliers/' + NO_SUPPLIER)}
                title={<span className="muted">{t('noSupplier')}</span>}
                subtitle={countText(noSupplier.expenses.length)}
                badge={noSupplier.overdue ? <Badge tone="danger">{tc('overdue')}</Badge> : undefined}
                detail={<Amount cents={noSupplier.total} />}
              />
            )}
          </List>
        )}

        {archivedRows.length > 0 && (
          <div className="pf-stack">
            {rows.length > 0 && (
              <div>
                <Button variant="plain" size="sm" onClick={() => setShowArchived((v) => !v)}>
                  {tc('showArchived')} ({archivedRows.length})
                </Button>
              </div>
            )}
            {showArchived && (
              <List header={t('archivedHeader')}>
                {archivedRows.map((r) => (
                  <ListRow key={r.supplier.id} href={href('/suppliers/' + r.supplier.id)} title={r.supplier.name} muted />
                ))}
              </List>
            )}
          </div>
        )}
      </div>
      <SupplierSheet open={sheetOpen} onClose={() => setSheetOpen(false)} onSaved={(s) => navigate('/suppliers/' + s.id)} />
    </>
  );
}

type ExpenseSheetState = { mode: 'new' } | { mode: 'edit'; expense: Expense } | null;

function SupplierDetail({ id }: { id: Id }) {
  const t = useT('suppliers');
  const tc = useT('common');
  const f = useFormat();
  const data = useData();
  const derived = useDerived();
  const actions = useActions();
  const toast = useToast();
  const confirm = useConfirm();
  const [editOpen, setEditOpen] = useState(false);
  const [expenseSheet, setExpenseSheet] = useState<ExpenseSheetState>(null);

  const isNone = id === NO_SUPPLIER;
  const supplier: Supplier | undefined = isNone ? undefined : derived.supplierById.get(id);
  const { unpaid, paid } = useMemo(() => supplierExpenses(data.expenses, isNone ? null : id), [data.expenses, id, isNone]);
  const owed = unpaid.reduce((s, e) => s + e.amount, 0);
  const back = { href: href('/suppliers'), label: t('backToList') };

  if (!isNone && !supplier) {
    return (
      <>
        <PageHeader title={t('title')} back={back} />
        <EmptyState icon="suppliers" title={t('notFound')} />
      </>
    );
  }

  const name = supplier?.name ?? t('noSupplier');
  const describe = (e: Expense) => e.description || derived.categoryById.get(e.categoryId)?.name || '—';

  const payOne = (e: Expense) => {
    actions.upsert('expenses', { ...e, paidOn: derived.today });
    toast.show(t('markedPaid'), { tone: 'success', action: { label: tc('undo'), onClick: () => actions.upsert('expenses', e) } });
  };

  const payAll = async () => {
    const ok = await confirm({
      title: t('payAllTitle'),
      message: t('payAllMessage', { count: unpaid.length, amount: f.money(owed) }),
      confirmLabel: t('payAll'),
    });
    if (!ok) return;
    const before = unpaid;
    actions.upsertMany('expenses', markPaid(before, derived.today));
    toast.show(t('payAllDone', { count: before.length }), { tone: 'success', action: { label: tc('undo'), onClick: () => actions.upsertMany('expenses', before) } });
  };

  const contact = supplier ? [supplier.email, supplier.phone].filter(Boolean).join(' · ') : t('noSupplierSub');

  return (
    <>
      <PageHeader
        title={name}
        subtitle={contact || undefined}
        back={back}
        action={
          unpaid.length > 1 ? (
            <Button variant="primary" icon={<Icon name="check" />} onClick={payAll}>
              {t('payAll')}
            </Button>
          ) : undefined
        }
      >
        <div className="pf-row-actions">
          {supplier && (
            <Button size="sm" icon={<Icon name="edit" />} onClick={() => setEditOpen(true)}>
              {tc('edit')}
            </Button>
          )}
          {supplier && !supplier.archived && (
            <Button size="sm" icon={<Icon name="plus" />} onClick={() => setExpenseSheet({ mode: 'new' })}>
              {t('addExpense')}
            </Button>
          )}
          {supplier?.archived && <Badge>{tc('archived')}</Badge>}
        </div>
      </PageHeader>

      <div className="pf-stack pf-stack--lg">
        {supplier?.notes && <p className="suppliers-notes">{supplier.notes}</p>}

        <List
          header={
            <span className="suppliers-listhead">
              <span>{t('unpaidHeader')}</span>
              {owed !== 0 && <span className="num">{f.money(owed)}</span>}
            </span>
          }
        >
          {unpaid.length === 0 ? (
            <ListRow title={<span className="muted">{t('noUnpaid')}</span>} />
          ) : (
            unpaid.map((e) => {
              const overdue = !!e.dueDate && e.dueDate < derived.today;
              return (
                <li key={e.id} className="pf-list__item suppliers-unpaid">
                  <button type="button" className="pf-row pf-row--interactive suppliers-unpaid__main" onClick={() => setExpenseSheet({ mode: 'edit', expense: e })}>
                    <span className="pf-row__main">
                      <span className="pf-row__title">
                        {describe(e)}
                        {overdue && (
                          <span className="pf-row__badge">
                            <Badge tone="danger">{tc('overdue')}</Badge>
                          </span>
                        )}
                      </span>
                      <span className="pf-row__subtitle">
                        {f.date(e.date, 'short')}
                        {e.dueDate ? ` · ${t('dueOn', { date: f.date(e.dueDate, 'short') })}` : ''}
                      </span>
                    </span>
                    <span className="pf-row__detail">
                      <Amount cents={e.amount} />
                    </span>
                  </button>
                  <Button size="sm" variant="secondary" icon={<Icon name="check" size={16} />} onClick={() => payOne(e)} aria-label={t('markPaidLabel', { name: describe(e) })} className="suppliers-unpaid__pay">
                    {t('markPaid')}
                  </Button>
                </li>
              );
            })
          )}
        </List>

        {!isNone && (
          <List header={t('paidHeader')}>
            {paid.length === 0 ? (
              <ListRow title={<span className="muted">{t('noPaid')}</span>} />
            ) : (
              paid.map((e) => (
                <ListRow
                  key={e.id}
                  onClick={() => setExpenseSheet({ mode: 'edit', expense: e })}
                  title={describe(e)}
                  subtitle={`${f.date(e.date, 'short')} · ${t('paidOnDate', { date: f.date(e.paidOn, 'short') })}`}
                  detail={<Amount cents={e.amount} tone={e.amount < 0 ? 'in' : 'out'} />}
                />
              ))
            )}
          </List>
        )}
      </div>

      <SupplierSheet key={supplier?.id} open={editOpen} supplier={supplier} onClose={() => setEditOpen(false)} />
      <ExpenseSheet
        key={expenseSheet?.mode === 'edit' ? expenseSheet.expense.id : 'new'}
        open={expenseSheet !== null}
        expense={expenseSheet?.mode === 'edit' ? expenseSheet.expense : undefined}
        defaults={supplier ? { supplierId: supplier.id } : undefined}
        onClose={() => setExpenseSheet(null)}
      />
    </>
  );
}
