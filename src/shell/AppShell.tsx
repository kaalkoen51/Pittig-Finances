import { Suspense, useEffect } from 'react';
import { isElectron } from '../storage';
import { useT } from '../i18n';
import { href, navigate, useRoute } from '../router';
import { DEFAULT_PATH, MORE_PATH, SCREENS, screenForPath, type ScreenRoute } from '../routes';
import { useAppStatus, useData, useDerived } from '../state/store';
import { Icon, List, ListRow, PageHeader, cx } from '../ui';
import { LoadingScreen } from './LoadingScreen';

function useNavItems(): ScreenRoute[] {
  const { todoImportCount } = useDerived();
  return SCREENS.filter((s) => !s.onlyWithTodoImports || todoImportCount > 0);
}

function NavCount({ screen }: { screen: ScreenRoute }) {
  const { todoImportCount } = useDerived();
  if (screen.name !== 'import' || !todoImportCount) return null;
  return <span className="pf-nav__count num">{todoImportCount}</span>;
}

function Sidebar({ active }: { active?: ScreenRoute }) {
  const tc = useT('common');
  const items = useNavItems();
  const data = useData();
  return (
    <nav className="pf-sidebar" aria-label={tc('appName')}>
      <div className="pf-sidebar__brand">
        <span className="pf-sidebar__logo" aria-hidden="true">
          <svg viewBox="0 0 64 64" width="28" height="28">
            <rect width="64" height="64" rx="14" fill="var(--accent-fill)" />
            <path d="M40 14c-2 0-3 2-3 4 0 1 1 2 2 2-9 2-17 12-17 24 0 4 2 6 5 6 10 0 18-12 18-24 0-2 0-4-1-5 1 0 2-1 2-2 0-3-3-5-6-5z" fill="#fff" />
          </svg>
        </span>
        <span className="pf-sidebar__name">{data.settings.businessName || tc('appName')}</span>
      </div>
      <ul className="pf-sidebar__list">
        {items.map((s) => (
          <li key={s.name}>
            <a className={cx('pf-nav', active?.name === s.name && 'is-active')} href={href(s.base)} aria-current={active?.name === s.name ? 'page' : undefined}>
              <Icon name={s.icon} size={20} />
              <span className="pf-nav__label">{tc(s.label)}</span>
              <NavCount screen={s} />
            </a>
          </li>
        ))}
      </ul>
      <SaveStatus />
    </nav>
  );
}

function SaveStatus() {
  const tc = useT('common');
  const { saveError } = useAppStatus();
  return (
    <div className="pf-sidebar__footer">
      {saveError ? (
        <span className="pf-save-error" role="alert">
          <Icon name="alert" size={14} /> {tc('saveFailed', { error: saveError })}
        </span>
      ) : (
        !isElectron() && <span>{tc('deviceOnly')}</span>
      )}
    </div>
  );
}

function TabBar({ active, onMore }: { active?: ScreenRoute; onMore: boolean }) {
  const tc = useT('common');
  const items = SCREENS.filter((s) => s.phoneTab);
  const { todoImportCount } = useDerived();
  const moreActive = onMore || (!!active && !active.phoneTab);
  return (
    <nav className="pf-tabbar" aria-label={tc('appName')}>
      {items.map((s) => (
        <a key={s.name} className={cx('pf-tab', active?.name === s.name && 'is-active')} href={href(s.base)} aria-current={active?.name === s.name ? 'page' : undefined}>
          <Icon name={s.icon} size={24} />
          <span>{tc(s.label)}</span>
        </a>
      ))}
      <a className={cx('pf-tab', moreActive && 'is-active')} href={href(MORE_PATH)} aria-current={onMore ? 'page' : undefined}>
        <span className="pf-tab__icon">
          <Icon name="more" size={24} />
          {todoImportCount > 0 && <span className="pf-tab__dot" aria-hidden="true" />}
        </span>
        <span>{tc('navMore')}</span>
      </a>
    </nav>
  );
}

function MoreScreen() {
  const tc = useT('common');
  const items = useNavItems().filter((s) => !s.phoneTab);
  return (
    <>
      <PageHeader title={tc('navMore')} />
      <List>
        {items.map((s) => (
          <ListRow key={s.name} href={href(s.base)} leading={<Icon name={s.icon} size={22} className="pf-more__icon" />} title={tc(s.label)} detail={<NavCount screen={s} />} />
        ))}
      </List>
    </>
  );
}

export function AppShell() {
  const { path } = useRoute();
  const onMore = path === MORE_PATH;
  const active = screenForPath(path);

  useEffect(() => {
    if (!active && !onMore) navigate(DEFAULT_PATH, { replace: true });
  }, [active, onMore]);

  useEffect(() => {
    document.querySelector('.pf-main')?.scrollTo?.({ top: 0 });
  }, [active?.name]);

  const Screen = active?.component;
  return (
    <div className="pf-app">
      <Sidebar active={active} />
      <main className="pf-main" id="main">
        <div className="pf-content">
          <Suspense fallback={<LoadingScreen inline />}>{onMore ? <MoreScreen /> : Screen ? <Screen /> : null}</Suspense>
        </div>
      </main>
      <TabBar active={active} onMore={onMore} />
    </div>
  );
}
