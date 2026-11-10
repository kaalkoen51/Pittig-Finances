import type { HTMLAttributes, ReactNode } from 'react';
import type { Cents } from '../domain/types';
import { useFormat } from '../i18n';
import { cx } from './cx';
import { Icon, type IconName } from './Icon';

export interface CardProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  title?: ReactNode;
  /** Element at the right of the title, e.g. a plain Button. */
  action?: ReactNode;
  /** Default true. false = no inner padding (e.g. when wrapping a List). */
  padded?: boolean;
}

/** Rounded (12px) elevated surface on the grouped background. */
export function Card({ title, action, padded = true, className, children, ...rest }: CardProps) {
  return (
    <section className={cx('pf-card', padded && 'pf-card--padded', className)} {...rest}>
      {(title || action) && (
        <header className="pf-card__header">
          {title && <h2 className="pf-card__title">{title}</h2>}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export interface StatProps {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  className?: string;
}

/** Label above a big number (use <Amount size="xl"> as value). */
export function Stat({ label, value, hint, className }: StatProps) {
  return (
    <div className={cx('pf-stat', className)}>
      <div className="pf-stat__label">{label}</div>
      <div className="pf-stat__value">{value}</div>
      {hint && <div className="pf-stat__hint">{hint}</div>}
    </div>
  );
}

export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';

export function Badge({ tone = 'neutral', children, className }: { tone?: BadgeTone; children: ReactNode; className?: string }) {
  return <span className={cx('pf-badge', `pf-badge--${tone}`, className)}>{children}</span>;
}

export interface EmptyStateProps {
  icon?: IconName;
  title: ReactNode;
  message?: ReactNode;
  /** Usually one primary Button. */
  action?: ReactNode;
  className?: string;
}

/** Friendly explanation of what to do when a list is empty. */
export function EmptyState({ icon, title, message, action, className }: EmptyStateProps) {
  return (
    <div className={cx('pf-empty', className)}>
      {icon && (
        <div className="pf-empty__icon">
          <Icon name={icon} size={32} />
        </div>
      )}
      <h2 className="pf-empty__title">{title}</h2>
      {message && <p className="pf-empty__message">{message}</p>}
      {action && <div className="pf-empty__action">{action}</div>}
    </div>
  );
}

export type AmountTone = 'in' | 'out' | 'neutral' | 'auto';

export interface AmountProps {
  cents: Cents;
  /**
   * in = green (money received), out = neutral text (money spent), neutral = plain,
   * auto = green when > 0, red when < 0. Default neutral.
   */
  tone?: AmountTone;
  /** Prefix "+" for positive values (negative always shows "−"). */
  signed?: boolean;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Drop ",00" for whole euros. */
  compact?: boolean;
  className?: string;
}

/** Formatted euro amount, tabular numbers, right-aligned in rows. */
export function Amount({ cents, tone = 'neutral', signed, size = 'md', compact, className }: AmountProps) {
  const f = useFormat();
  const colour = tone === 'in' ? 'in' : tone === 'auto' ? (cents > 0 ? 'in' : cents < 0 ? 'neg' : 'zero') : tone;
  return <span className={cx('pf-amount', 'num', `pf-amount--${colour}`, `pf-amount--${size}`, className)}>{f.money(cents, { signed, compact })}</span>;
}
