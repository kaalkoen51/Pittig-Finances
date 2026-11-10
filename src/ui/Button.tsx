import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cx } from './cx';

export type ButtonVariant = 'primary' | 'secondary' | 'plain' | 'destructive';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** primary = filled accent (max one per view); secondary = tinted; plain = text only; destructive = red. */
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  /** Leading icon element, e.g. <Icon name="plus" />. */
  icon?: ReactNode;
  /** Full width. */
  block?: boolean;
}

/** Button. Defaults to type="button" so it never submits a form by accident. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon, block, className, type = 'button', children, ...rest },
  ref,
) {
  return (
    <button ref={ref} type={type} className={cx('pf-btn', `pf-btn--${variant}`, `pf-btn--${size}`, block && 'pf-btn--block', className)} {...rest}>
      {icon && <span className="pf-btn__icon">{icon}</span>}
      {children !== undefined && children !== null && <span className="pf-btn__label">{children}</span>}
    </button>
  );
});
