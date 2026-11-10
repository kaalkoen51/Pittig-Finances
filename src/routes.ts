/**
 * Top-level screens, in nav order. Owned by the foundation agent – feature agents do NOT edit this;
 * sub-routes (e.g. /clients/:id) are handled inside the screen with useMatch().
 */
import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import type { KeyOf } from './i18n';
import type { IconName } from './ui/Icon';

export type ScreenName = 'overview' | 'sales' | 'clients' | 'expenses' | 'batches' | 'suppliers' | 'import' | 'settings';

export interface ScreenRoute {
  name: ScreenName;
  /** Base path; the screen owns `base` and everything under `base/…`. */
  base: string;
  icon: IconName;
  /** Nav label key in i18n/common.ts. */
  label: KeyOf<'common'>;
  component: LazyExoticComponent<ComponentType>;
  /** Shown in the phone tab bar (others go under "More"). */
  phoneTab: boolean;
  /** Only shown in nav when there are import rows with status 'todo'. */
  onlyWithTodoImports?: boolean;
}

export const SCREENS: ScreenRoute[] = [
  { name: 'overview', base: '/overview', icon: 'overview', label: 'navOverview', phoneTab: true, component: lazy(() => import('./screens/overview')) },
  { name: 'sales', base: '/sales', icon: 'sales', label: 'navSales', phoneTab: true, component: lazy(() => import('./screens/sales')) },
  { name: 'clients', base: '/clients', icon: 'clients', label: 'navClients', phoneTab: true, component: lazy(() => import('./screens/clients')) },
  { name: 'expenses', base: '/expenses', icon: 'expenses', label: 'navExpenses', phoneTab: true, component: lazy(() => import('./screens/expenses')) },
  { name: 'batches', base: '/batches', icon: 'batches', label: 'navBatches', phoneTab: false, component: lazy(() => import('./screens/batches')) },
  { name: 'suppliers', base: '/suppliers', icon: 'suppliers', label: 'navSuppliers', phoneTab: false, component: lazy(() => import('./screens/suppliers')) },
  { name: 'import', base: '/import', icon: 'import', label: 'navImport', phoneTab: false, onlyWithTodoImports: true, component: lazy(() => import('./screens/import')) },
  { name: 'settings', base: '/settings', icon: 'settings', label: 'navSettings', phoneTab: false, component: lazy(() => import('./screens/settings')) },
];

export const DEFAULT_PATH = '/overview';
/** Phone-only list of the screens that are not in the tab bar. */
export const MORE_PATH = '/more';

/** The screen that owns `path` (base match or `base/…`), or undefined. */
export function screenForPath(path: string): ScreenRoute | undefined {
  return SCREENS.find((s) => path === s.base || path.startsWith(`${s.base}/`));
}
