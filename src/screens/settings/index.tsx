import { useT } from '../../i18n';
import { PageHeader } from '../../ui';

/** Placeholder – to be built by the feature agent that owns this screen. */
export default function SettingsScreen() {
  const t = useT('settings');
  return <PageHeader title={t('title')} />;
}
