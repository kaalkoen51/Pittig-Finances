import type { ReactNode } from 'react';
import { cx } from './cx';
import { Icon } from './Icon';

export interface PageHeaderProps {
  /** Large title (h1). */
  title: ReactNode;
  subtitle?: ReactNode;
  /** The one primary action of the screen, e.g. <Button variant="primary" icon={<Icon name="plus"/>}>Verkoop</Button>. */
  action?: ReactNode;
  /** Back link for detail screens: { href: href('/clients'), label: 'Klanten' }. */
  back?: { href: string; label: string };
  /** Toolbar row under the title (search, filters, segmented). */
  children?: ReactNode;
  className?: string;
}

export function PageHeader({ title, subtitle, action, back, children, className }: PageHeaderProps) {
  return (
    <header className={cx('pf-page-header', className)}>
      {back && (
        <a className="pf-page-header__back" href={back.href}>
          <Icon name="chevron-left" size={18} />
          {back.label}
        </a>
      )}
      <div className="pf-page-header__row">
        <div className="pf-page-header__titles">
          <h1 className="pf-page-header__title">{title}</h1>
          {subtitle && <p className="pf-page-header__subtitle">{subtitle}</p>}
        </div>
        {action && <div className="pf-page-header__action">{action}</div>}
      </div>
      {children && <div className="pf-page-header__toolbar">{children}</div>}
    </header>
  );
}
