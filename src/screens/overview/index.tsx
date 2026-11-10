import { useMemo, useState } from 'react';
import { hasUserContent, isExpenseOverdue } from '../../domain/calc';
import { demoData } from '../../domain/fixtures';
import { periodRange } from '../../domain/dates';
import type { PeriodKey } from '../../domain/types';
import { plural, useFormat, useLang, useT } from '../../i18n';
import { href, navigate } from '../../router';
import { useActions, useData, useDerived } from '../../state/store';
import { Amount, Badge, Button, Card, Icon, List, ListRow, PageHeader, Segmented, Stat, useToast } from '../../ui';
import { StatusBadge } from '../sales/StatusBadge';
import { buildActivity, type ActivityItem } from './activity';
import './overview.css';

const PERIOD_KEY = 'pittig.overview.period';

function loadPeriod(): PeriodKey {
  try {
    const v = localStorage.getItem(PERIOD_KEY);
    if (v === 'thisMonth' || v === 'lastMonth' || v === 'thisYear' || v === 'all') return v;
  } catch {
    /* ignore */
  }
  return 'thisMonth';
}

/** "+ Sale" opens #/sales?new=1, "+ Expense" opens #/expenses?new=1 (handled by those screens). */
export default function OverviewScreen() {
  const t = useT('overview');
  const tc = useT('common');
  const data = useData();
  const derived = useDerived();
  const [period, setPeriodState] = useState<PeriodKey>(loadPeriod);
  const setPeriod = (p: PeriodKey) => {
    setPeriodState(p);
    try {
      localStorage.setItem(PERIOD_KEY, p);
    } catch {
      /* ignore */
    }
  };

  const range = useMemo(() => periodRange(period, derived.today), [period, derived.today]);
  const summary = useMemo(() => derived.period(range), [derived, range]);
  const activity = useMemo(() => buildActivity(data, 8), [data]);

  const debtorCount = [...derived.clients.values()].filter((c) => c.outstanding > 0).length;
  const unpaidBills = derived.supplierOwed.reduce((n, g) => n + g.expenses.length, 0);
  const overdueBills = derived.supplierOwed.reduce((n, g) => n + g.expenses.filter((e) => isExpenseOverdue(e, derived.today)).length, 0);

  const actions = (
    <div className="overview-actions">
      <Button variant="primary" size="lg" icon={<Icon name="plus" size={20} />} onClick={() => navigate('/sales?new=1')}>
        {t('addSale')}
      </Button>
      <Button variant="secondary" size="lg" icon={<Icon name="plus" size={20} />} onClick={() => navigate('/expenses?new=1')}>
        {t('addExpense')}
      </Button>
    </div>
  );

  if (!hasUserContent(data)) {
    return (
      <div className="overview">
        <PageHeader title={t('title')} />
        <FirstRun />
      </div>
    );
  }

  return (
    <div className="overview">
      <PageHeader title={t('title')} subtitle={data.settings.businessName || undefined}>
        <Segmented
          aria-label={t('periodLabel')}
          value={period}
          onChange={setPeriod}
          size="sm"
          options={[
            { value: 'thisMonth', label: tc('thisMonth') },
            { value: 'lastMonth', label: tc('lastMonth') },
            { value: 'thisYear', label: tc('thisYear') },
            { value: 'all', label: tc('allTime') },
          ]}
        />
      </PageHeader>

      <div className="pf-stack pf-stack--lg">
        {actions}

        <div className="overview-stats">
          <Card>
            <Stat label={tc('moneyIn')} value={<Amount cents={summary.moneyIn} size="xl" tone="in" />} hint={t('moneyInHint')} />
          </Card>
          <Card>
            <Stat label={tc('moneyOut')} value={<Amount cents={summary.moneyOut} size="xl" tone="out" />} hint={t('moneyOutHint')} />
          </Card>
          <Card>
            <Stat label={tc('result')} value={<Amount cents={summary.result} size="xl" tone="auto" />} hint={t('resultHint')} />
          </Card>
        </div>

        <div className="overview-balances">
          <a className="overview-balance" href={href('/clients')}>
            <Stat label={tc('owedToYou')} value={<Amount cents={derived.owedToYou} size="lg" />} hint={debtorCount ? plural(debtorCount, t('owedToYouHintOne'), t('owedToYouHint', { count: debtorCount })) : t('owedToYouNone')} />
            <Icon name="chevron-right" size={18} className="overview-balance__chevron" />
          </a>
          <a className="overview-balance" href={href('/suppliers')}>
            <Stat
              label={tc('youOwe')}
              value={<Amount cents={derived.youOwe} size="lg" />}
              hint={
                unpaidBills ? (
                  <span className="overview-hint">
                    {plural(unpaidBills, t('youOweHintOne'), t('youOweHint', { count: unpaidBills }))}
                    {overdueBills > 0 && <Badge tone="danger">{t('youOweOverdue', { count: overdueBills })}</Badge>}
                  </span>
                ) : (
                  t('youOweNone')
                )
              }
            />
            <Icon name="chevron-right" size={18} className="overview-balance__chevron" />
          </a>
        </div>

        <List header={t('recent')}>
          {activity.length === 0 ? <ListRow title={<span className="muted">{t('recentEmpty')}</span>} /> : activity.map((a) => <ActivityRow key={`${a.kind}-${a.id}`} item={a} />)}
        </List>
      </div>
    </div>
  );

}

function ActivityRow({ item }: { item: ActivityItem }) {
  const t = useT('overview');
  const tc = useT('common');
  const f = useFormat();
  const derived = useDerived();
  const date = f.date(item.date, 'short');
  switch (item.kind) {
    case 'sale': {
      const s = item.sale;
      const name = s.clientId ? (derived.clientById.get(s.clientId)?.name ?? '?') : null;
      return (
        <ListRow
          href={href(`/sales?edit=${s.id}`)}
          leading={<span className="overview-dot overview-dot--sale"><Icon name="sales" size={16} /></span>}
          title={name ?? t('activityWalkIn')}
          subtitle={name ? `${t('activitySale')} · ${date}` : date}
          detail={<Amount cents={item.amount} />}
          status={s.clientId ? <StatusBadge info={derived.sales.get(s.id)} /> : undefined}
        />
      );
    }
    case 'payment': {
      const p = item.payment;
      const name = derived.clientById.get(p.clientId)?.name ?? '?';
      return (
        <ListRow
          href={href(`/clients/${p.clientId}`)}
          leading={<span className="overview-dot overview-dot--in"><Icon name="money" size={16} /></span>}
          title={name}
          subtitle={`${p.amount < 0 ? t('activityRefund') : t('activityPayment')} · ${date}`}
          detail={<Amount cents={p.amount} tone="auto" signed />}
        />
      );
    }
    case 'expense': {
      const e = item.expense;
      const cat = derived.categoryById.get(e.categoryId);
      const sup = e.supplierId ? derived.supplierById.get(e.supplierId)?.name : undefined;
      return (
        <ListRow
          href={href('/expenses')}
          leading={
            <span className="overview-dot" style={cat ? { color: cat.color } : undefined}>
              <Icon name="expenses" size={16} />
            </span>
          }
          title={e.description || cat?.name || tc('navExpenses')}
          subtitle={[date, sup ?? cat?.name].filter(Boolean).join(' · ')}
          detail={<Amount cents={-e.amount} tone="neutral" signed />}
          status={e.paidOn === null ? <Badge tone="warning">{t('activityExpenseUnpaid')}</Badge> : undefined}
        />
      );
    }
  }
}

function FirstRun() {
  const t = useT('overview');
  const actions = useActions();
  const toast = useToast();
  const lang = useLang();
  const [loading, setLoading] = useState(false);
  const steps = [
    { n: 1, title: t('step1Title'), text: t('step1Text'), action: t('addSale'), to: '/sales?new=1', optional: false },
    { n: 2, title: t('step2Title'), text: t('step2Text'), action: t('addExpense'), to: '/expenses?new=1', optional: false },
    { n: 3, title: t('step3Title'), text: t('step3Text'), action: t('step3Action'), to: '/batches', optional: true },
  ];
  const tryDemo = async () => {
    setLoading(true);
    try {
      const demo = demoData();
      await actions.replaceAll({ ...demo, settings: { ...demo.settings, language: lang } });
      toast.show(t('demoLoaded'), { tone: 'success' });
    } catch (e) {
      setLoading(false);
      toast.show(t('demoFailed', { error: e instanceof Error ? e.message : String(e) }), { tone: 'danger' });
    }
  };
  return (
    <div className="overview-welcome">
      <div className="overview-welcome__intro">
        <h2>{t('emptyTitle')}</h2>
        <p className="muted">{t('emptyMessage')}</p>
      </div>
      <ol className="overview-steps">
        {steps.map((s) => (
          <li key={s.n} className="overview-step">
            <span className="overview-step__n" aria-hidden="true">
              {s.n}
            </span>
            <div className="overview-step__body">
              <h3>
                {s.title}
                {s.optional && <span className="overview-step__optional"> ({t('stepOptional')})</span>}
              </h3>
              <p className="muted">{s.text}</p>
            </div>
            <Button variant={s.n === 1 ? 'primary' : 'secondary'} icon={s.optional ? undefined : <Icon name="plus" size={18} />} onClick={() => navigate(s.to)}>
              {s.action}
            </Button>
          </li>
        ))}
      </ol>
      <List header={t('otherWays')}>
        <ListRow leading={<Icon name="refresh" size={20} className="overview-way" />} title={t('tryDemo')} subtitle={t('tryDemoHint')} onClick={loading ? undefined : tryDemo} />
        <ListRow leading={<Icon name="import" size={20} className="overview-way" />} title={t('importStatement')} subtitle={t('importStatementHint')} href={href('/import?wizard=1')} />
        <ListRow leading={<Icon name="upload" size={20} className="overview-way" />} title={t('importExcel')} subtitle={t('importExcelHint')} href={href('/import?wizard=1')} />
      </List>
    </div>
  );
}
