import { useMemo, useState } from 'react';
import { normalizeDescription } from '../../domain/importing';
import { useFormat, useT } from '../../i18n';
import { href, navigate, useMatch } from '../../router';
import { useData, useDerived } from '../../state/store';
import { Amount, Badge, Button, EmptyState, Icon, List, ListRow, PageHeader, SearchField } from '../../ui';
import { ClientDetail } from './ClientDetail';
import { ClientSheet } from './ClientSheet';
import { sortClients } from './clientList';
import './clients.css';


export default function ClientsScreen() {
  const m = useMatch('/clients/:id');
  if (m?.id) return <ClientDetail key={m.id} id={m.id} />;
  return <ClientList />;
}

function ClientList() {
  const t = useT('clients');
  const tc = useT('common');
  const f = useFormat();
  const data = useData();
  const derived = useDerived();
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [adding, setAdding] = useState(false);

  const archivedCount = data.clients.filter((c) => c.archived).length;
  const rows = useMemo(() => {
    const q = normalizeDescription(search);
    const list = data.clients.filter((c) => (showArchived || !c.archived) && (!q || normalizeDescription(c.name).includes(q)));
    return sortClients(list, derived.clients);
  }, [data.clients, derived.clients, search, showArchived]);

  const addButton = (
    <Button variant="primary" icon={<Icon name="plus" size={18} />} onClick={() => setAdding(true)}>
      {t('addClient')}
    </Button>
  );

  return (
    <div className="clients">
      <PageHeader title={t('title')} action={addButton}>
        {data.clients.length > 0 && <SearchField value={search} onChange={setSearch} placeholder={t('searchPlaceholder')} />}
      </PageHeader>

      {data.clients.length === 0 ? (
        <EmptyState icon="clients" title={t('emptyTitle')} message={t('emptyMessage')} />
      ) : rows.length === 0 && !archivedCount ? (
        <EmptyState icon="search" title={t('noMatchesTitle')} />
      ) : (
        <List
          footer={
            archivedCount > 0 ? (
              <button type="button" className="clients-link" onClick={() => setShowArchived((v) => !v)}>
                {showArchived ? t('hideArchived') : t('archivedCount', { count: archivedCount })}
              </button>
            ) : undefined
          }
        >
          {rows.length === 0 && <ListRow title={<span className="muted">{t('noMatchesTitle')}</span>} />}
          {rows.map((c) => {
            const s = derived.clients.get(c.id);
            const open = s?.outstanding ?? 0;
            return (
              <ListRow
                key={c.id}
                href={href(`/clients/${c.id}`)}
                muted={c.archived}
                title={c.name}
                badge={c.archived ? <Badge>{tc('archived')}</Badge> : undefined}
                subtitle={t('rowSubtitle', { sold: f.money(s?.sold ?? 0), received: f.money(s?.received ?? 0) })}
                detail={
                  open !== 0 ? (
                    <>
                      <Amount cents={Math.abs(open)} className={open > 0 ? 'clients-open' : undefined} />
                      <span className="clients-balance">{open > 0 ? t('stillOpen') : t('credit')}</span>
                    </>
                  ) : (
                    <Badge tone="success">{tc('paid')}</Badge>
                  )
                }
              />
            );
          })}
        </List>
      )}
      <ClientSheet open={adding} onClose={() => setAdding(false)} onSaved={(c) => navigate(`/clients/${c.id}`)} />
    </div>
  );
}
