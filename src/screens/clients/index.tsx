import { useT } from '../../i18n';
import { EmptyState, PageHeader } from '../../ui';

/** Placeholder – to be built by the feature agent that owns this screen. */
export default function ClientsScreen() {
  const t = useT('clients');
  return (
    <>
      <PageHeader title={t('title')} />
      <EmptyState icon="clients" title={t('emptyTitle')} message={t('emptyMessage')} />
    </>
  );
}
