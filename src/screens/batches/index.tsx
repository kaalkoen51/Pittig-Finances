import { useT } from '../../i18n';
import { EmptyState, PageHeader } from '../../ui';

/** Placeholder – to be built by the feature agent that owns this screen. */
export default function BatchesScreen() {
  const t = useT('batches');
  return (
    <>
      <PageHeader title={t('title')} />
      <EmptyState icon="batches" title={t('emptyTitle')} message={t('emptyMessage')} />
    </>
  );
}
