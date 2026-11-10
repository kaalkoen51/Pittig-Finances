import { forwardRef, type InputHTMLAttributes } from 'react';
import { isISODate } from '../domain/dates';
import { useFormat } from '../i18n';
import type { ISODate } from '../domain/types';
import { cx } from './cx';
import { useFieldProps } from './Field';

export interface DateFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  /** 'YYYY-MM-DD' or '' / undefined for empty. */
  value: ISODate | undefined;
  /** Called with a valid ISO date, or undefined when cleared. */
  onChange: (value: ISODate | undefined) => void;
}

/**
 * Native date picker, value in ISO format. The browser formats the field by its own locale
 * (possibly mm/dd/yyyy), so the chosen date is repeated underneath in words ("Tuesday 10 November 2026").
 */
export const DateField = forwardRef<HTMLInputElement, DateFieldProps>(function DateField({ value, onChange, className, id, ...rest }, ref) {
  const f = useFieldProps(id);
  const fmt = useFormat();
  return (
    <>
    <input
      ref={ref}
      type="date"
      className={cx('pf-input', 'pf-date', 'num', className)}
      value={value ?? ''}
      onChange={(e) => {
        const v = e.target.value;
        if (v === '') onChange(undefined);
        else if (isISODate(v)) onChange(v);
      }}
      {...f}
      {...rest}
    />
    {value && isISODate(value) && <span className="pf-date__words">{fmt.date(value, 'long')}</span>}
    </>
  );
});
