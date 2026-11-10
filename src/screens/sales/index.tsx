import { useEffect, useMemo, useState } from 'react';
import { saleTotal } from '../../domain/calc';
import type { Id, Sale } from '../../domain/types';
import { useFormat, useT } from '../../i18n';
import { navigate, useRoute } from '../../router';
import { useData, useDerived } from '../../state/store';
import { Amount, Button, EmptyState, Icon, List, ListRow, PageHeader, SearchField, Segmented } from '../../ui';
import { SaleSheet } from './SaleSheet';
import { StatusBadge } from './StatusBadge';
import { itemsSummary } from './saleForm';
import { groupSales, type SaleFilter } from './salesList';


/**
 * Sales list. URL conventions (used by Overview / Clients):
 *   #/sales?new=1            open the add sheet
 *   #/sales?new=1&client=ID  … with that client preselected
 *   #/sales?edit=SALE_ID     open the edit sheet for a sale
 * The query is removed (replace) once the sheet is opened.
 */
export default function SalesScreen() {
  const t = useT('sales');
  const tc = useT('common');
  const f = useFormat();
  const data = useData();
  const derived = useDerived();
  const { query } = useRoute();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<SaleFilter>('all');
  const [sheet, setSheet] = useState<{ sale?: Sale; clientId?: Id } | null>(null);

  const qNew = query.get('new');
  const qEdit = query.get('edit');
  const qClient = query.get('client');
  useEffect(() => {
    if (qNew) {
      setSheet({ ...(qClient ? { clientId: qClient } : {}) });
      navigate('/sales', { replace: true });
    } else if (qEdit) {
      const s = derived.saleById.get(qEdit);
      if (s) setSheet({ sale: s });
      navigate('/sales', { replace: true });
    }
  }, [qNew, qEdit, qClient, derived.saleById]);

  const groups = useMemo(
    () =>
      groupSales(data.sales, {
        filter,
        query: search,
        info: derived.sales,
        clientById: derived.clientById,
        productById: derived.productById,
        walkInLabel: tc('walkIn'),
      }),
    [data.sales, filter, search, derived, tc],
  );

  const productName = (id: Id) => derived.productById.get(id)?.name ?? '?';
  const hasSales = data.sales.length > 0;

  return (
    <div className="sales">
      <PageHeader
        title={t('title')}
        action={
          <Button variant="primary" icon={<Icon name="plus" size={18} />} onClick={() => setSheet({})}>
            {t('addSale')}
          </Button>
        }
      >
        {hasSales && (
          <div className="sales-toolbar">
            <SearchField value={search} onChange={setSearch} placeholder={t('searchPlaceholder')} />
            <Segmented
              aria-label={t('filterLabel')}
              value={filter}
              onChange={setFilter}
              size="sm"
              options={[
                { value: 'all', label: t('filterAll') },
                { value: 'open', label: t('filterOpen') },
                { value: 'paid', label: t('filterPaid') },
              ]}
            />
          </div>
        )}
      </PageHeader>

      {!hasSales ? (
        <EmptyState
          icon="sales"
          title={t('emptyTitle')}
          message={t('emptyMessage')}
          action={
            <Button variant="primary" icon={<Icon name="plus" size={18} />} onClick={() => setSheet({})}>
              {t('newSale')}
            </Button>
          }
        />
      ) : groups.length === 0 ? (
        <EmptyState icon="search" title={t('noMatchesTitle')} message={t('noMatchesMessage')} />
      ) : (
        <div className="pf-stack pf-stack--lg">
          {groups.map((g) => (
            <List
              key={g.month}
              header={
                <span className="sales-month">
                  <span>{f.month(g.month)}</span>
                  <span className="num">{t('monthTotal', { count: g.sales.length, amount: f.money(g.total) })}</span>
                </span>
              }
            >
              {g.sales.map((s) => {
                const info = derived.sales.get(s.id);
                return (
                  <ListRow
                    key={s.id}
                    onClick={() => setSheet({ sale: s })}
                    title={s.clientId ? (derived.clientById.get(s.clientId)?.name ?? '?') : tc('walkIn')}
                    subtitle={`${f.date(s.date, 'short')} · ${itemsSummary(s, productName, f.lang)}`}
                    detail={
                      <span className="sales-row__detail">
                        <Amount cents={saleTotal(s)} />
                        <StatusBadge info={info} />
                      </span>
                    }
                  />
                );
              })}
            </List>
          ))}
        </div>
      )}

      <SaleSheet open={!!sheet} sale={sheet?.sale} clientId={sheet?.clientId} onClose={() => setSheet(null)} />
    </div>
  );
}
