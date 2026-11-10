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
  /** Small tag at the end of the subtitle line that is never cut off (e.g. a batch code). */
  tag?: ReactNode;
  /**
   * Status badge for the row (Open / Paid / Overdue…). Shown under the detail on wide screens;
   * on phones it sits on the subtitle line so the title keeps its room.
   */
  status?: ReactNode;
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
export function ListRow({ title, subtitle, detail, leading, badge, tag, status, href, onClick, chevron, muted, className }: ListRowProps) {
  const interactive = !!(href || onClick);
  const showChevron = chevron ?? interactive;
  const hasSide = detail !== undefined || !!status;
  const content = (
    <>
      {leading && <span className="pf-row__leading">{leading}</span>}
      <span className="pf-row__main">
        <span className="pf-row__title">
          <span className="pf-row__title-text">{title}</span>
          {badge && <span className="pf-row__badge">{badge}</span>}
        </span>
        {(subtitle || tag) && (
          <span className="pf-row__subtitle">
            {subtitle && <span className="pf-row__subtext">{subtitle}</span>}
            {tag && <span className="pf-row__tag">{tag}</span>}
          </span>
        )}
      </span>
      {hasSide && (
        <span className="pf-row__side">
          {detail !== undefined && <span className="pf-row__detail">{detail}</span>}
          {status && <span className="pf-row__status">{status}</span>}
        </span>
      )}
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
