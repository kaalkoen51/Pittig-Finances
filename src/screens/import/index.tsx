import { useT } from '../../i18n';
import { EmptyState, PageHeader } from '../../ui';

/** Placeholder – to be built by the feature agent that owns this screen. */
export default function ImportScreen() {
  const t = useT('import');
  return (
    <>
      <PageHeader title={t('title')} />
      <EmptyState icon="import" title={t('emptyTitle')} message={t('emptyMessage')} />
    </>
  );
}
