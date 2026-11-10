import { useMemo, useState } from 'react';
import type { Payment, Sale } from '../../domain/types';
import { useFormat, useT } from '../../i18n';
import { href, navigate } from '../../router';
import { useActions, useData, useDerived } from '../../state/store';
import { Amount, Badge, Button, Card, EmptyState, Icon, List, ListRow, PageHeader, Stat, useConfirm, useToast } from '../../ui';
import { SaleSheet } from '../sales/SaleSheet';
import { StatusBadge } from '../sales/StatusBadge';
import { itemsSummary } from '../sales/saleForm';
import { ClientSheet } from './ClientSheet';
import { RecordPaymentSheet } from './RecordPaymentSheet';
import { clientHistory } from './paymentForm';

export function ClientDetail({ id }: { id: string }) {
  const t = useT('clients');
  const tc = useT('common');
  const f = useFormat();
  const data = useData();
  const derived = useDerived();
  const actions = useActions();
  const confirm = useConfirm();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [payment, setPayment] = useState<{ payment?: Payment } | null>(null);
  const [saleSheet, setSaleSheet] = useState<{ sale?: Sale } | null>(null);

  const client = derived.clientById.get(id);
  const history = useMemo(() => clientHistory(data, id), [data, id]);
  const back = { href: href('/clients'), label: t('title') };

  if (!client) {
    return (
      <>
        <PageHeader title={t('title')} back={back} />
        <EmptyState icon="clients" title={t('notFoundTitle')} message={t('notFoundMessage')} />
      </>
    );
  }

  const s = derived.clients.get(id);
  const outstanding = s?.outstanding ?? 0;
  const referenced = actions.isReferenced('clients', id);
  const productName = (pid: string) => derived.productById.get(pid)?.name ?? '?';

  const onDelete = async () => {
    if (!(await confirm({ title: tc('deleteTitle', { name: client.name }), message: tc('deleteMessage'), destructive: true, confirmLabel: tc('delete') }))) return;
    if (actions.remove('clients', id)) {
      toast.show(tc('deletedToast'));
      navigate('/clients', { replace: true });
    }
  };

  const onArchive = () => {
    actions.archive('clients', id, !client.archived);
    toast.show(client.archived ? tc('savedToast') : tc('archivedToast'));
  };

  return (
    <div className="clients-detail">
      <PageHeader
        title={client.name}
        subtitle={client.archived ? <Badge>{tc('archived')}</Badge> : undefined}
        back={back}
        action={
          <Button variant="primary" icon={<Icon name="money" size={18} />} onClick={() => setPayment({})}>
            {t('recordPayment')}
          </Button>
        }
      />
      <div className="pf-stack pf-stack--lg">
        <Card>
          <div className="clients-stats">
            <Stat label={t('bought')} value={<Amount cents={s?.sold ?? 0} size="lg" />} />
            <Stat label={t('received')} value={<Amount cents={s?.received ?? 0} size="lg" tone="in" />} />
            <Stat
              label={outstanding < 0 ? t('credit') : t('stillOpen')}
              value={<Amount cents={Math.abs(outstanding)} size="lg" className={outstanding > 0 ? 'clients-open' : undefined} />}
            />
          </div>
        </Card>

        <div className="pf-row-actions">
          <Button variant="secondary" icon={<Icon name="plus" size={16} />} onClick={() => setSaleSheet({})}>
            {t('newSale')}
          </Button>
        </div>

        <Card
          title={t('contact')}
          action={
            <Button variant="plain" size="sm" onClick={() => setEditing(true)}>
              {tc('edit')}
            </Button>
          }
        >
          {client.email || client.phone || client.notes ? (
            <dl className="clients-contact">
              {client.email && (
                <>
                  <dt>{tc('email')}</dt>
                  <dd>
                    <a href={`mailto:${client.email}`}>{client.email}</a>
                  </dd>
                </>
              )}
              {client.phone && (
                <>
                  <dt>{tc('phone')}</dt>
                  <dd>
                    <a href={`tel:${client.phone.replace(/\s/g, '')}`}>{client.phone}</a>
                  </dd>
                </>
              )}
              {client.notes && (
                <>
                  <dt>{tc('notes')}</dt>
                  <dd className="clients-notes">{client.notes}</dd>
                </>
              )}
            </dl>
          ) : (
            <p className="muted clients-p">{t('noContact')}</p>
          )}
        </Card>

        <List header={t('history')}>
          {history.length === 0 ? (
            <ListRow title={<span className="muted">{t('historyEmpty')}</span>} />
          ) : (
            history.map((h) =>
              h.kind === 'sale' ? (
                <ListRow
                  key={`s-${h.id}`}
                  onClick={() => setSaleSheet({ sale: h.sale })}
                  title={t('historySale')}
                  badge={<StatusBadge info={derived.sales.get(h.id)} />}
                  subtitle={`${f.date(h.date, 'short')} · ${itemsSummary(h.sale, productName, f.lang)}`}
                  detail={
                    <>
                      <Amount cents={h.amount} />
                      <span className="clients-balance">{t('balanceAfter', { amount: f.money(h.balance) })}</span>
                    </>
                  }
                />
              ) : (
                <ListRow
                  key={`p-${h.id}`}
                  onClick={() => setPayment({ payment: h.payment })}
                  title={h.amount < 0 ? t('historyRefund') : t('historyPayment')}
                  subtitle={[f.date(h.date, 'short'), h.payment.method ? tc(methodKey(h.payment.method)) : null, h.payment.notes].filter(Boolean).join(' · ')}
                  detail={
                    <>
                      <Amount cents={h.amount} tone="auto" signed />
                      <span className="clients-balance">{t('balanceAfter', { amount: f.money(h.balance) })}</span>
                    </>
                  }
                />
              ),
            )
          )}
        </List>

        <div className="clients-danger">
          {client.archived && <p className="muted clients-p">{t('archivedNote')}</p>}
          {referenced && !client.archived && <p className="muted clients-p">{t('referencedNote')}</p>}
          <div className="pf-row-actions">
            {(referenced || client.archived) && (
              <Button variant="plain" size="sm" icon={<Icon name="archive" size={16} />} onClick={onArchive}>
                {client.archived ? t('unarchiveClient') : t('archiveClient')}
              </Button>
            )}
            {!referenced && (
              <Button variant="plain" size="sm" className="clients-delete" icon={<Icon name="trash" size={16} />} onClick={onDelete}>
                {t('deleteClient')}
              </Button>
            )}
          </div>
        </div>
      </div>

      <ClientSheet open={editing} client={client} onClose={() => setEditing(false)} />
      <RecordPaymentSheet open={!!payment} payment={payment?.payment} clientId={id} onClose={() => setPayment(null)} />
      <SaleSheet open={!!saleSheet} sale={saleSheet?.sale} clientId={id} onClose={() => setSaleSheet(null)} />
    </div>
  );
}

function methodKey(m: NonNullable<Payment['method']>) {
  return m === 'bank' ? 'methodBank' : m === 'cash' ? 'methodCash' : m === 'card' ? 'methodCard' : 'methodOther';
}
