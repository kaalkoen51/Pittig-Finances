import { useT } from '../../i18n';
import { EmptyState, PageHeader } from '../../ui';

/** Placeholder – to be built by the feature agent that owns this screen. */
export default function SalesScreen() {
  const t = useT('sales');
  return (
    <>
      <PageHeader title={t('title')} />
      <EmptyState icon="sales" title={t('emptyTitle')} message={t('emptyMessage')} />
    </>
  );
}
