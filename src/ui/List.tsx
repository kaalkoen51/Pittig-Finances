import type { ReactNode } from 'react';
import { cx } from './cx';
import { Icon } from './Icon';

export interface ListProps {
  /** Small uppercase-ish heading above the group. */
  header?: ReactNode;
  /** Small grey text under the group. */
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
  'aria-label'?: string;
}

/** iOS-style inset grouped list. Children are ListRow elements. */
export function List({ header, footer, children, className, ...aria }: ListProps) {
  return (
    <div className={cx('pf-list-group', className)}>
      {header && <div className="pf-list-group__header">{header}</div>}
      <ul className="pf-list" {...aria}>
        {children}
      </ul>
      {footer && <div className="pf-list-group__footer">{footer}</div>}
    </div>
  );
}

export interface ListRowProps {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Right side: usually an <Amount>, optionally with a Badge. */
  detail?: ReactNode;
  /** Left side: icon / colour dot / avatar. */
  leading?: ReactNode;
  /** Shown after the title (e.g. <Badge>). */
  badge?: ReactNode;
  /** Navigate (hash link, e.g. href('/clients/123')). */
  href?: string;
  onClick?: () => void;
  /** Default: shown when href or onClick is set. */
  chevron?: boolean;
  /** Muted look (archived items). */
  muted?: boolean;
  className?: string;
}

/** One row: leading · title/subtitle · detail · chevron. Whole row is the click target. */
export function ListRow({ title, subtitle, detail, leading, badge, href, onClick, chevron, muted, className }: ListRowProps) {
  const interactive = !!(href || onClick);
  const showChevron = chevron ?? interactive;
  const content = (
    <>
      {leading && <span className="pf-row__leading">{leading}</span>}
      <span className="pf-row__main">
        <span className="pf-row__title">
          {title}
          {badge && <span className="pf-row__badge">{badge}</span>}
        </span>
        {subtitle && <span className="pf-row__subtitle">{subtitle}</span>}
      </span>
      {detail !== undefined && <span className="pf-row__detail">{detail}</span>}
      {showChevron && (
        <span className="pf-row__chevron" aria-hidden="true">
          <Icon name="chevron-right" size={16} />
        </span>
      )}
    </>
  );
  const cls = cx('pf-row', interactive && 'pf-row--interactive', muted && 'pf-row--muted');
  return (
    <li className={cx('pf-list__item', className)}>
      {href ? (
        <a className={cls} href={href} onClick={onClick}>
          {content}
        </a>
      ) : onClick ? (
        <button type="button" className={cls} onClick={onClick}>
          {content}
        </button>
      ) : (
        <div className={cls}>{content}</div>
      )}
    </li>
  );
}
