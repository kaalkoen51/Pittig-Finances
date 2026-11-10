import { useT } from '../../i18n';
import { EmptyState, PageHeader } from '../../ui';

/** Placeholder – to be built by the feature agent that owns this screen. */
export default function ExpensesScreen() {
  const t = useT('expenses');
  return (
    <>
      <PageHeader title={t('title')} />
      <EmptyState icon="expenses" title={t('emptyTitle')} message={t('emptyMessage')} />
    </>
  );
}
