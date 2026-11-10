import { forwardRef, useEffect, useRef, useState, type InputHTMLAttributes } from 'react';
import { centsToInput, parseMoney } from '../domain/money';
import type { Cents } from '../domain/types';
import { useLang } from '../i18n';
import { cx } from './cx';
import { useFieldProps } from './Field';

export interface MoneyInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  /** Cents, or null when empty/invalid. */
  value: Cents | null | undefined;
  /** Called on every keystroke with parsed cents (null when empty or not a number). */
  onChange: (cents: Cents | null) => void;
  /** Default false: a typed minus sign is ignored (use a "Refund" toggle for negatives). */
  allowNegative?: boolean;
}

/**
 * Euro amount input. Accepts "12,50", "12.50", "1.234,56", "€ 12" etc. (parseMoney).
 * Reformats to "12.50" (en) / "12,50" (nl) on blur. Shows "€" prefix. inputMode=decimal for phone keyboards.
 */
export const MoneyInput = forwardRef<HTMLInputElement, MoneyInputProps>(function MoneyInput(
  { value, onChange, allowNegative = false, className, id, onBlur, onFocus, placeholder, ...rest },
  ref,
) {
  const lang = useLang();
  const f = useFieldProps(id);
  const [text, setText] = useState(() => centsToInput(value ?? null, lang));
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setText(centsToInput(value ?? null, lang));
  }, [value, lang]);

  const parsed = text.trim() === '' ? null : parseMoney(text, lang);
  const invalid = text.trim() !== '' && parsed === null;

  return (
    <div className={cx('pf-money', className)}>
      <span className="pf-money__prefix" aria-hidden="true">
        €
      </span>
      <input
        ref={ref}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        className="pf-input pf-money__input num"
        placeholder={placeholder ?? (lang === 'nl' ? '0,00' : '0.00')}
        value={text}
        {...f}
        {...(invalid ? { 'aria-invalid': true } : {})}
        onFocus={(e) => {
          focused.current = true;
          onFocus?.(e);
        }}
        onChange={(e) => {
          const t = e.target.value;
          setText(t);
          let c = t.trim() === '' ? null : parseMoney(t, lang);
          if (c !== null && !allowNegative) c = Math.abs(c);
          onChange(c);
        }}
        onBlur={(e) => {
          focused.current = false;
          if (parsed !== null) setText(centsToInput(allowNegative ? parsed : Math.abs(parsed), lang));
          onBlur?.(e);
        }}
        {...rest}
      />
    </div>
  );
});
