import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { cx } from './cx';

export interface ChoiceOption<V extends string = string> {
  value: V;
  label: ReactNode;
  /** Chips only: colour dot (e.g. category colour). */
  color?: string;
  disabled?: boolean;
}

function arrowNav(e: KeyboardEvent<HTMLElement>, container: HTMLElement | null) {
  if (!container) return;
  const keys = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'];
  if (!keys.includes(e.key)) return;
  const btns = Array.from(container.querySelectorAll<HTMLButtonElement>('button:not([disabled])'));
  const i = btns.indexOf(document.activeElement as HTMLButtonElement);
  let n = i;
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') n = (i + 1) % btns.length;
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') n = (i - 1 + btns.length) % btns.length;
  else if (e.key === 'Home') n = 0;
  else if (e.key === 'End') n = btns.length - 1;
  e.preventDefault();
  btns[n]?.focus();
  btns[n]?.click();
}

export interface SegmentedProps<V extends string> {
  options: ChoiceOption<V>[];
  value: V;
  onChange: (value: V) => void;
  'aria-label': string;
  size?: 'sm' | 'md';
  block?: boolean;
  className?: string;
}

/** iOS segmented control (2–5 options). Radio-group semantics with arrow keys. */
export function Segmented<V extends string>({ options, value, onChange, size = 'md', block, className, ...aria }: SegmentedProps<V>) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div ref={ref} role="radiogroup" className={cx('pf-seg', `pf-seg--${size}`, block && 'pf-seg--block', className)} {...aria} onKeyDown={(e) => arrowNav(e, ref.current)}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            disabled={o.disabled}
            className={cx('pf-seg__item', on && 'is-on')}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export interface ChipsProps<V extends string> {
  options: ChoiceOption<V>[];
  /** Selected value; undefined = none. */
  value: V | undefined;
  onChange: (value: V | undefined) => void;
  'aria-label': string;
  /** Clicking the selected chip clears the selection. */
  allowDeselect?: boolean;
  /** Extra element at the end, e.g. a "+ New" chip button. */
  trailing?: ReactNode;
  className?: string;
}

/** Wrapping single-select chips (e.g. expense categories). Radio-group semantics. */
export function Chips<V extends string>({ options, value, onChange, allowDeselect, trailing, className, ...aria }: ChipsProps<V>) {
  const ref = useRef<HTMLDivElement>(null);
  const firstFocusable = value ?? options.find((o) => !o.disabled)?.value;
  return (
    <div ref={ref} role="radiogroup" className={cx('pf-chips', className)} {...aria} onKeyDown={(e) => arrowNav(e, ref.current)}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={o.value === firstFocusable ? 0 : -1}
            disabled={o.disabled}
            className={cx('pf-chip', on && 'is-on')}
            onClick={() => onChange(on && allowDeselect ? undefined : o.value)}
          >
            {o.color && <span className="pf-chip__dot" style={{ background: o.color }} aria-hidden="true" />}
            {o.label}
          </button>
        );
      })}
      {trailing}
    </div>
  );
}

export interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  id?: string;
  className?: string;
}

/** iOS switch row: label left, switch right. role=switch, Space/Enter toggles. */
export function Toggle({ checked, onChange, label, description, disabled, id, className }: ToggleProps) {
  return (
    <label className={cx('pf-toggle', disabled && 'is-disabled', className)}>
      <span className="pf-toggle__text">
        <span className="pf-toggle__label">{label}</span>
        {description && <span className="pf-toggle__desc">{description}</span>}
      </span>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        className={cx('pf-switch', checked && 'is-on')}
        onClick={() => onChange(!checked)}
      >
        <span className="pf-switch__knob" />
      </button>
    </label>
  );
}
