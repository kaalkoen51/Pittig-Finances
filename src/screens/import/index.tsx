import { useMemo, useState } from 'react';
import { useT } from '../../i18n';
import { navigate, useRoute } from '../../router';
import { useData } from '../../state/store';
import { Button, EmptyState, Icon, PageHeader, Toggle } from '../../ui';
import { ImportWizard } from './ImportWizard';
import { HandledRow, RowCard } from './RowCard';
import './import.css';

/** "To sort": imported bank/Excel rows that the user sorts by hand. `#/import?wizard=1` opens the import wizard. */
export default function ImportScreen() {
  const t = useT('import');
  const data = useData();
  const { query } = useRoute();
  const [showHandled, setShowHandled] = useState(false);
  const wizardOpen = query.get('wizard') === '1';
  const setWizard = (open: boolean) => navigate(open ? '/import?wizard=1' : '/import', { replace: !open });

  const byDateDesc = (a: { date: string; importedAt: string }, b: { date: string; importedAt: string }) =>
    a.date < b.date ? 1 : a.date > b.date ? -1 : a.importedAt < b.importedAt ? 1 : -1;
  const todo = useMemo(() => data.importRows.filter((r) => r.status === 'todo').sort(byDateDesc), [data.importRows]);
  const handled = useMemo(() => data.importRows.filter((r) => r.status !== 'todo').sort(byDateDesc), [data.importRows]);

  return (
    <>
      <PageHeader
        className="import-header"
        title={t('title')}
        subtitle={todo.length ? t('todoCount', { count: todo.length }) : undefined}
        action={
          <Button variant="secondary" icon={<Icon name="upload" size={18} />} onClick={() => setWizard(true)}>
            {t('importButton')}
          </Button>
        }
      />
      <div className="pf-stack pf-stack--lg import-screen">
        {todo.length === 0 ? (
          <EmptyState
            icon="import"
            title={t('emptyTitle')}
            message={t('emptyMessage')}
            action={
              <Button variant="primary" icon={<Icon name="upload" size={18} />} onClick={() => setWizard(true)}>
                {t('importButton')}
              </Button>
            }
          />
        ) : (
          <div className="pf-stack import-list">
            {todo.map((r) => (
              <RowCard key={r.id} row={r} />
            ))}
          </div>
        )}

        {data.importRows.length > 0 && (
          <div className="import-handled-section">
            <Toggle checked={showHandled} onChange={setShowHandled} label={t('showHandled')} />
            {showHandled && (
              <div className="import-handled-list">
                {handled.length === 0 ? <p className="muted">{t('noHandled')}</p> : handled.map((r) => <HandledRow key={r.id} row={r} />)}
              </div>
            )}
          </div>
        )}
      </div>
      <ImportWizard open={wizardOpen} onClose={() => setWizard(false)} />
    </>
  );
}
