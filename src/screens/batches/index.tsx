import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { lineTotal } from '../../domain/calc';
import type { Batch, BatchStats, Expense, Id, Product } from '../../domain/types';
import { useFormat, useT } from '../../i18n';
import { href, navigate, useMatch, useRoute } from '../../router';
import { useActions, useData, useDerived } from '../../state/store';
import { Amount, Badge, Button, Card, EmptyState, Icon, List, ListRow, PageHeader, Stat, useToast } from '../../ui';
import { ExpenseSheet } from '../expenses/ExpenseSheet';
import { BatchSheet } from './BatchSheet';
import { ProductSheet } from './ProductSheet';
import { salesForBatch, sortBatches } from './batchLogic';
import './batches.css';

export default function BatchesScreen() {
  const m = useMatch('/batches/:id');
  return m ? <BatchDetail id={m.id!} /> : <BatchOverview />;
}

type ProductSheetState = { product?: Product } | null;
type BatchSheetState = { batch?: Batch; productId?: Id } | null;

function BatchOverview() {
  const t = useT('batches');
  const tc = useT('common');
  const f = useFormat();
  const data = useData();
  const derived = useDerived();
  const { query } = useRoute();
  const [productSheet, setProductSheet] = useState<ProductSheetState>(null);
  const [batchSheet, setBatchSheet] = useState<BatchSheetState>(null);
  const [showArchived, setShowArchived] = useState(false);

  const wantsNew = query.get('new');
  useEffect(() => {
    if (wantsNew === '1' || wantsNew === 'batch') setBatchSheet({});
    else if (wantsNew === 'product') setProductSheet({});
    if (wantsNew) navigate('/batches', { replace: true });
  }, [wantsNew]);

  const products = useMemo(() => [...data.products].sort((a, b) => a.name.localeCompare(b.name)), [data.products]);
  const active = products.filter((p) => !p.archived);
  const archived = products.filter((p) => p.archived);
  const visible = showArchived ? [...active, ...archived] : active;
  const batchesByProduct = useMemo(() => {
    const m = new Map<Id, Batch[]>();
    for (const b of data.batches) m.set(b.productId, [...(m.get(b.productId) ?? []), b]);
    return m;
  }, [data.batches]);

  return (
    <>
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        action={
          active.length > 0 ? (
            <Button variant="primary" icon={<Icon name="plus" />} onClick={() => setBatchSheet({})}>
              {t('add')}
            </Button>
          ) : undefined
        }
      >
        {products.length > 0 && (
          <div className="pf-row-actions">
            <Button size="sm" icon={<Icon name="plus" />} onClick={() => setProductSheet({})}>
              {t('addProduct')}
            </Button>
          </div>
        )}
      </PageHeader>

      {products.length === 0 ? (
        <EmptyState
          icon="batches"
          title={t('emptyTitle')}
          message={t('emptyMessage')}
          action={
            <Button variant="primary" icon={<Icon name="plus" />} onClick={() => setProductSheet({})}>
              {t('emptyAction')}
            </Button>
          }
        />
      ) : (
        <div className="pf-stack pf-stack--lg">
          {visible.map((p) => {
            const ps = derived.products.get(p.id);
            const batches = sortBatches(batchesByProduct.get(p.id) ?? []);
            const totalsVars = { batches: batches.length, revenue: f.money(ps?.revenue ?? 0), profit: f.money(ps?.profit ?? 0) };
            return (
              <section key={p.id} className="batches-product" aria-labelledby={`product-${p.id}`}>
                <header className="batches-product__header">
                  <div className="batches-product__titles">
                    <h2 id={`product-${p.id}`} className="batches-product__name">
                      {p.name} {p.archived && <Badge>{tc('archived')}</Badge>}
                    </h2>
                    <p className="batches-product__meta">
                      {t('perUnit', { price: f.money(p.defaultPrice), unit: p.unit })}
                      {batches.length > 0 && <> · {batches.length === 1 ? t('productTotalsOne', totalsVars) : t('productTotals', totalsVars)}</>}
                    </p>
                  </div>
                  <div className="pf-row-actions">
                    <Button size="sm" variant="plain" icon={<Icon name="edit" size={16} />} onClick={() => setProductSheet({ product: p })}>
                      {tc('edit')}
                    </Button>
                    {!p.archived && (
                      <Button size="sm" variant="plain" icon={<Icon name="plus" size={16} />} onClick={() => setBatchSheet({ productId: p.id })}>
                        {t('addBatchFor')}
                      </Button>
                    )}
                  </div>
                </header>
                {batches.length === 0 ? (
                  <p className="muted batches-none">{t('noBatches')}</p>
                ) : (
                  <div className="batches-grid">
                    {batches.map((b) => (
                      <BatchCard key={b.id} batch={b} product={p} stats={derived.batches.get(b.id)} />
                    ))}
                  </div>
                )}
              </section>
            );
          })}

          {archived.length > 0 && (
            <div>
              <Button variant="plain" size="sm" onClick={() => setShowArchived((v) => !v)}>
                {showArchived ? t('hideArchivedProducts') : t('showArchivedProducts', { count: archived.length })}
              </Button>
            </div>
          )}

          <Card title={t('generalCostsTitle')} action={<a href={href('/expenses')} className="batches-link">{t('viewExpenses')}</a>}>
            <div className="pf-stack">
              <Amount cents={derived.generalCosts} size="lg" />
              <p className="muted batches-explain">{t('generalCostsExplain')}</p>
            </div>
          </Card>
        </div>
      )}

      <ProductSheet key={productSheet?.product?.id ?? 'new-p'} open={productSheet !== null} product={productSheet?.product} onClose={() => setProductSheet(null)} />
      <BatchSheet
        key={batchSheet?.batch?.id ?? 'new-b-' + (batchSheet?.productId ?? '')}
        open={batchSheet !== null}
        batch={batchSheet?.batch}
        defaultProductId={batchSheet?.productId}
        onClose={() => setBatchSheet(null)}
      />
    </>
  );
}

function BatchCard({ batch, product, stats }: { batch: Batch; product: Product; stats: BatchStats | undefined }) {
  const t = useT('batches');
  const tc = useT('common');
  const f = useFormat();
  const s = stats;
  return (
    <a href={href('/batches/' + batch.id)} className={`batches-card${batch.closed ? ' batches-card--closed' : ''}`}>
      <div className="batches-card__head">
        <span className="batches-card__code">{batch.code}</span>
        {batch.closed && <Badge>{tc('closed')}</Badge>}
        <Icon name="chevron-right" size={16} className="batches-card__chevron" />
      </div>
      <div className="batches-card__date">
        {t('produced')} {f.date(batch.producedOn, 'medium')}
      </div>
      <dl className="batches-stats">
        <BatchStatItem label={tc('quantity')} value={`${batch.quantity} ${product.unit}`} />
        <BatchStatItem label={t('unitsSold')} value={String(s?.unitsSold ?? 0)} />
        <BatchStatItem label={t('unitsLeft')} value={String(s?.unitsLeft ?? batch.quantity)} warn={(s?.unitsLeft ?? 0) < 0} />
        <BatchStatItem label={t('costs')} value={<Amount cents={s?.costs ?? 0} size="sm" />} />
        <BatchStatItem label={t('revenue')} value={<Amount cents={s?.revenue ?? 0} size="sm" />} />
        <BatchStatItem label={tc('profit')} value={<Amount cents={s?.profit ?? 0} size="sm" tone="auto" />} />
        <BatchStatItem label={t('costPerUnit')} value={s?.costPerUnit != null ? <Amount cents={s.costPerUnit} size="sm" /> : '—'} wide />
      </dl>
    </a>
  );
}

function BatchStatItem({ label, value, warn, wide }: { label: string; value: ReactNode; warn?: boolean; wide?: boolean }) {
  return (
    <div className={`batches-stats__item${wide ? ' batches-stats__item--wide' : ''}`}>
      <dt>{label}</dt>
      <dd className={`num${warn ? ' batches-warn' : ''}`}>{value}</dd>
    </div>
  );
}

type ExpenseSheetState = { mode: 'new' } | { mode: 'edit'; expense: Expense } | null;

function BatchDetail({ id }: { id: Id }) {
  const t = useT('batches');
  const tc = useT('common');
  const f = useFormat();
  const data = useData();
  const derived = useDerived();
  const actions = useActions();
  const toast = useToast();
  const te = useT('expenses');
  const [editOpen, setEditOpen] = useState(false);
  const [expenseSheet, setExpenseSheet] = useState<ExpenseSheetState>(null);

  const batch = derived.batchById.get(id);
  const product = batch ? derived.productById.get(batch.productId) : undefined;
  const stats = batch ? derived.batches.get(batch.id) : undefined;
  const expenses = useMemo(() => data.expenses.filter((e) => e.batchId === id).sort((a, b) => b.date.localeCompare(a.date)), [data.expenses, id]);
  const sales = useMemo(() => salesForBatch(data.sales, id), [data.sales, id]);
  const back = { href: href('/batches'), label: t('title') };

  if (!batch) {
    return (
      <>
        <PageHeader title={t('title')} back={back} />
        <EmptyState icon="batches" title={t('batchNotFound')} />
      </>
    );
  }

  const unit = product?.unit ?? '';
  const toggleClosed = () => {
    actions.archive('batches', batch.id, !batch.closed);
    toast.show(batch.closed ? t('reopenedToast') : t('closedToast'));
  };

  return (
    <>
      <PageHeader
        title={`${product?.name ?? ''} · ${batch.code}`}
        subtitle={`${t('produced')} ${f.date(batch.producedOn, 'medium')}`}
        back={back}
        action={
          <Button variant="primary" icon={<Icon name="plus" />} onClick={() => setExpenseSheet({ mode: 'new' })}>
            <span className="batches-addcost--long">{t('addCostLong')}</span>
            <span className="batches-addcost--short">{t('addCost')}</span>
          </Button>
        }
      >
        <div className="pf-row-actions">
          <Button size="sm" icon={<Icon name="edit" size={16} />} onClick={() => setEditOpen(true)}>
            {tc('edit')}
          </Button>
          <Button size="sm" icon={<Icon name={batch.closed ? 'refresh' : 'archive'} size={16} />} onClick={toggleClosed} title={t('closeHint')}>
            {batch.closed ? t('reopenBatch') : t('closeBatch')}
          </Button>
          {batch.closed && <Badge>{tc('closed')}</Badge>}
        </div>
      </PageHeader>

      <div className="pf-stack pf-stack--lg">
        <Card>
          <div className="batches-detail-stats">
            <Stat label={tc('profit')} value={<Amount cents={stats?.profit ?? 0} size="xl" tone="auto" />} />
            <Stat label={t('costPerUnit')} value={stats?.costPerUnit != null ? <Amount cents={stats.costPerUnit} size="xl" /> : '—'} />
            <Stat label={t('revenue')} value={<Amount cents={stats?.revenue ?? 0} size="lg" />} />
            <Stat label={t('costs')} value={<Amount cents={stats?.costs ?? 0} size="lg" />} />
            <Stat label={t('quantityProduced')} value={<span className="num">{`${batch.quantity} ${unit}`}</span>} />
            <Stat
              label={`${t('unitsSold')} / ${t('unitsLeft')}`}
              value={<span className="num">{`${stats?.unitsSold ?? 0} / ${stats?.unitsLeft ?? batch.quantity}`}</span>}
              hint={(stats?.unitsLeft ?? 0) < 0 ? <span className="batches-warn">{t('overSold')}</span> : undefined}
            />
          </div>
        </Card>

        {batch.notes && <p className="batches-notes">{batch.notes}</p>}

        <List
          header={
            <span className="batches-listhead">
              <span>{t('linkedExpenses')}</span>
              {expenses.length > 0 && <span className="num">{f.money(stats?.costs ?? 0)}</span>}
            </span>
          }
          footer={expenses.length === 0 ? t('noLinkedExpenses') : undefined}
        >
          {expenses.length === 0 ? (
            <ListRow title={t('addCostLong')} leading={<Icon name="plus" />} onClick={() => setExpenseSheet({ mode: 'new' })} chevron={false} />
          ) : (
            expenses.map((e) => {
              const cat = derived.categoryById.get(e.categoryId);
              const sup = e.supplierId ? derived.supplierById.get(e.supplierId) : undefined;
              return (
                <ListRow
                  key={e.id}
                  onClick={() => setExpenseSheet({ mode: 'edit', expense: e })}
                  leading={<span className="batches-dot" style={{ background: cat?.color ?? 'var(--label-3)' }} aria-hidden="true" />}
                  title={e.description || cat?.name || '—'}
                  subtitle={[f.date(e.date, 'short'), sup?.name, cat?.name].filter(Boolean).join(' · ')}
                  badge={e.paidOn === null ? <Badge tone="warning">{te('unpaid')}</Badge> : undefined}
                  detail={<Amount cents={e.amount} />}
                />
              );
            })
          )}
        </List>

        <List
          header={
            <span className="batches-listhead">
              <span>{t('linkedSales')}</span>
              {sales.length > 0 && <span className="num">{f.money(stats?.revenue ?? 0)}</span>}
            </span>
          }
        >
          {sales.length === 0 ? (
            <ListRow title={<span className="muted">{t('noLinkedSales')}</span>} />
          ) : (
            sales.map(({ sale, item }, i) => {
              const client = sale.clientId ? derived.clientById.get(sale.clientId) : undefined;
              return (
                <ListRow
                  key={`${sale.id}-${i}`}
                  href={client ? href('/clients/' + client.id) : undefined}
                  title={client?.name ?? t('walkIn')}
                  subtitle={`${f.date(sale.date, 'short')} · ${t('saleLine', { qty: item.quantity, price: f.money(item.unitPrice) })}`}
                  detail={<Amount cents={lineTotal(item)} tone="in" />}
                />
              );
            })
          )}
        </List>
      </div>

      <BatchSheet key={batch.id} open={editOpen} batch={batch} onClose={() => setEditOpen(false)} />
      <ExpenseSheet
        key={expenseSheet?.mode === 'edit' ? expenseSheet.expense.id : 'new'}
        open={expenseSheet !== null}
        expense={expenseSheet?.mode === 'edit' ? expenseSheet.expense : undefined}
        defaults={{ batchId: batch.id }}
        title={expenseSheet?.mode === 'new' ? te('batchCostTitle', { code: batch.code }) : undefined}
        onClose={() => setExpenseSheet(null)}
      />
    </>
  );
}
