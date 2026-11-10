import { useT } from '../../i18n';
import { EmptyState, PageHeader } from '../../ui';

/** Placeholder – to be built by the feature agent that owns this screen. */
export default function SuppliersScreen() {
  const t = useT('suppliers');
  return (
    <>
      <PageHeader title={t('title')} />
      <EmptyState icon="suppliers" title={t('emptyTitle')} message={t('emptyMessage')} />
    </>
  );
}
