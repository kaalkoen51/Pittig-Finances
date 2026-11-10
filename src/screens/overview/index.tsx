import { useT } from '../../i18n';
import { EmptyState, PageHeader } from '../../ui';

/** Placeholder – to be built by the feature agent that owns this screen. */
export default function OverviewScreen() {
  const t = useT('overview');
  return (
    <>
      <PageHeader title={t('title')} />
      <EmptyState icon="overview" title={t('emptyTitle')} message={t('emptyMessage')} />
    </>
  );
}
