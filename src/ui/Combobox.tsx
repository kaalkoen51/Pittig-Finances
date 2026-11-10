import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { normalizeDescription } from '../domain/importing';
import { useT } from '../i18n';
import { cx } from './cx';
import { useFieldProps } from './Field';
import { Icon } from './Icon';

export interface ComboOption {
  value: string;
  label: string;
  /** Secondary text on the right, e.g. an open balance. */
  hint?: string;
}

export interface ComboboxProps {
  /** Selected option value (an id), or undefined. */
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  options: ComboOption[];
  /**
   * Enables "Add “xyz”": called with the typed text; return the new option's value (id) so it gets
   * selected. Typically: create the entity with upsert() and return its id.
   */
  onCreate?: (label: string) => string | void;
  placeholder?: string;
  /** Show a clear (×) button when something is selected. */
  allowClear?: boolean;
  id?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  'aria-label'?: string;
  className?: string;
}

/**
 * Type-to-filter picker with optional "Add new". Keyboard: ↑/↓ move, Enter picks (does not submit
 * the form while the list is open), Esc closes the list (a second Esc closes the sheet).
 */
export function Combobox({ value, onChange, options, onCreate, placeholder, allowClear, id, disabled, autoFocus, className, ...aria }: ComboboxProps) {
  const tc = useT('common');
  const f = useFieldProps(id);
  const listId = useId();
  const selected = options.find((o) => o.value === value);
  const [text, setText] = useState(selected?.label ?? '');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [typed, setTyped] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!open) setText(selected?.label ?? '');
  }, [selected?.label, open]);

  const query = typed ? text.trim() : '';
  const filtered = useMemo(() => {
    if (!query) return options;
    const q = normalizeDescription(query);
    return options.filter((o) => normalizeDescription(o.label).includes(q));
  }, [options, query]);
  const exact = query && options.some((o) => normalizeDescription(o.label) === normalizeDescription(query));
  const canCreate = !!onCreate && !!query && !exact;
  type Item = { kind: 'option'; option: ComboOption } | { kind: 'create'; label: string };
  const items: Item[] = [...filtered.map((option) => ({ kind: 'option' as const, option })), ...(canCreate ? [{ kind: 'create' as const, label: query }] : [])];

  useEffect(() => {
    if (active >= items.length) setActive(Math.max(0, items.length - 1));
  }, [items.length, active]);

  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView?.({ block: 'nearest' });
  }, [active, open]);

  const pick = (item: Item | undefined) => {
    if (!item) return;
    if (item.kind === 'option') {
      onChange(item.option.value);
      setText(item.option.label);
    } else {
      const newId = onCreate?.(item.label);
      if (newId) onChange(newId);
      setText(item.label);
    }
    setOpen(false);
    setTyped(false);
  };

  const close = () => {
    setOpen(false);
    setTyped(false);
    setText(selected?.label ?? '');
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) setOpen(true);
      else setActive((a) => Math.min(a + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      if (open && items.length) {
        e.preventDefault();
        pick(items[active]);
      }
    } else if (e.key === 'Escape') {
      if (open) {
        e.preventDefault();
        e.stopPropagation();
        e.nativeEvent.stopImmediatePropagation?.();
        close();
      }
    } else if (e.key === 'Tab') {
      if (open && typed && items.length && query) pick(items[active]);
      else close();
    }
  };

  const optionId = (i: number) => `${listId}-o${i}`;

  return (
    <div className={cx('pf-combo', open && 'pf-combo--open', className)}>
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && items.length ? optionId(active) : undefined}
        autoComplete="off"
        className="pf-input pf-combo__input"
        placeholder={placeholder}
        disabled={disabled}
        autoFocus={autoFocus}
        value={text}
        {...f}
        {...aria}
        onChange={(e) => {
          setText(e.target.value);
          setTyped(true);
          setOpen(true);
          setActive(0);
          if (e.target.value === '' && allowClear) onChange(undefined);
        }}
        onFocus={() => {
          setOpen(true);
          setTyped(false);
          const idx = options.findIndex((o) => o.value === value);
          setActive(idx >= 0 ? idx : 0);
        }}
        onClick={() => setOpen(true)}
        onBlur={() => {
          // Allow option mousedown to run first.
          setTimeout(() => {
            if (document.activeElement !== inputRef.current) close();
          }, 0);
        }}
        onKeyDown={onKeyDown}
      />
      {allowClear && selected && !disabled ? (
        <button
          type="button"
          className="pf-combo__clear"
          aria-label={tc('clear')}
          tabIndex={-1}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            onChange(undefined);
            setText('');
            inputRef.current?.focus();
          }}
        >
          <Icon name="close" size={14} />
        </button>
      ) : (
        <span className="pf-combo__chevron" aria-hidden="true">
          <Icon name="chevron-down" size={16} />
        </span>
      )}
      {open && (
        <ul ref={listRef} id={listId} role="listbox" className="pf-combo__list">
          {items.length === 0 && <li className="pf-combo__empty">{tc('noResults')}</li>}
          {items.map((item, i) => (
            <li
              key={item.kind === 'option' ? item.option.value : '__create'}
              id={optionId(i)}
              data-index={i}
              role="option"
              aria-selected={item.kind === 'option' && item.option.value === value}
              className={cx('pf-combo__option', i === active && 'is-active', item.kind === 'create' && 'pf-combo__option--create')}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(item);
              }}
              onMouseEnter={() => setActive(i)}
            >
              {item.kind === 'option' ? (
                <>
                  <span className="pf-combo__label">{item.option.label}</span>
                  {item.option.hint && <span className="pf-combo__hint num">{item.option.hint}</span>}
                  {item.option.value === value && <Icon name="check" size={16} className="pf-combo__check" />}
                </>
              ) : (
                <>
                  <Icon name="plus" size={16} />
                  <span className="pf-combo__label">{tc('createOption', { name: item.label })}</span>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
