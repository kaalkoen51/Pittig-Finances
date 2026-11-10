import { forwardRef, type InputHTMLAttributes } from 'react';
import { isISODate } from '../domain/dates';
import type { ISODate } from '../domain/types';
import { cx } from './cx';
import { useFieldProps } from './Field';

export interface DateFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  /** 'YYYY-MM-DD' or '' / undefined for empty. */
  value: ISODate | undefined;
  /** Called with a valid ISO date, or undefined when cleared. */
  onChange: (value: ISODate | undefined) => void;
}

/** Native date picker (locale-formatted by the OS), value in ISO format. */
export const DateField = forwardRef<HTMLInputElement, DateFieldProps>(function DateField({ value, onChange, className, id, ...rest }, ref) {
  const f = useFieldProps(id);
  return (
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
  );
});
