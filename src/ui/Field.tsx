import { createContext, forwardRef, useContext, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cx } from './cx';

interface FieldCtx {
  id: string;
  describedBy?: string;
  invalid: boolean;
}
const Ctx = createContext<FieldCtx | null>(null);

/** Inside a <Field>, returns the input id + aria props to spread on the control. */
export function useFieldProps(id?: string): { id: string | undefined; 'aria-describedby'?: string; 'aria-invalid'?: true } {
  const f = useContext(Ctx);
  return {
    id: id ?? f?.id,
    ...(f?.describedBy ? { 'aria-describedby': f.describedBy } : {}),
    ...(f?.invalid ? { 'aria-invalid': true as const } : {}),
  };
}

export interface FieldProps {
  label: ReactNode;
  /** Small grey help text under the control. */
  hint?: ReactNode;
  /** Error text (shown in red, sets aria-invalid on the control). */
  error?: ReactNode;
  /** Shows "(optional)" style suffix text after the label. */
  optionalLabel?: string;
  /** Use an explicit id for the control (otherwise generated). */
  htmlFor?: string;
  children: ReactNode;
  className?: string;
  /** Render label and control on one row (for toggles / short controls). */
  inline?: boolean;
}

/**
 * Label + control + hint/error. The control (TextInput, MoneyInput, DateField, Combobox, Select,
 * TextArea) picks up the id and aria attributes automatically.
 */
export function Field({ label, hint, error, optionalLabel, htmlFor, children, className, inline }: FieldProps) {
  const gen = useId();
  const id = htmlFor ?? `f${gen}`;
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = error ? `${id}-err` : undefined;
  const describedBy = [errId, hintId].filter(Boolean).join(' ') || undefined;
  return (
    <div className={cx('pf-field', inline && 'pf-field--inline', !!error && 'pf-field--error', className)}>
      <label className="pf-field__label" htmlFor={id}>
        {label}
        {optionalLabel && <span className="pf-field__optional"> ({optionalLabel})</span>}
      </label>
      <Ctx.Provider value={{ id, describedBy, invalid: !!error }}>
        <div className="pf-field__control">{children}</div>
      </Ctx.Provider>
      {error && (
        <div id={errId} className="pf-field__error" role="alert">
          {error}
        </div>
      )}
      {hint && (
        <div id={hintId} className="pf-field__hint">
          {hint}
        </div>
      )}
    </div>
  );
}

export type TextInputProps = InputHTMLAttributes<HTMLInputElement>;

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput({ className, id, type = 'text', ...rest }, ref) {
  const f = useFieldProps(id);
  return <input ref={ref} type={type} className={cx('pf-input', className)} {...f} {...rest} />;
});

export type TextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea({ className, id, rows = 3, ...rest }, ref) {
  const f = useFieldProps(id);
  return <textarea ref={ref} rows={rows} className={cx('pf-input', 'pf-textarea', className)} {...f} {...rest} />;
});

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}
export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange' | 'value'> {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  /** Adds a first option with value '' (e.g. "None"). */
  placeholder?: string;
}

/** Native select (good on phones). For pick-or-create use Combobox. */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select({ className, id, value, onChange, options, placeholder, ...rest }, ref) {
  const f = useFieldProps(id);
  return (
    <select ref={ref} className={cx('pf-input', 'pf-select', className)} value={value} onChange={(e) => onChange(e.target.value)} {...f} {...rest}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value} disabled={o.disabled}>
          {o.label}
        </option>
      ))}
    </select>
  );
});
