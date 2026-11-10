import { useT } from '../i18n';

export function LoadingScreen({ inline }: { inline?: boolean }) {
  const tc = useT('common');
  return (
    <div className={inline ? 'pf-loading pf-loading--inline' : 'pf-loading'} role="status" aria-live="polite">
      <span className="pf-spinner" aria-hidden="true" />
      <span className="visually-hidden">{tc('loading')}</span>
    </div>
  );
}
