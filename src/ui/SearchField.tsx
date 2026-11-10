import { useT } from '../i18n';
import { cx } from './cx';
import { Icon } from './Icon';

export interface SearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  'aria-label'?: string;
  className?: string;
  autoFocus?: boolean;
}

/** Rounded search box with magnifier and clear button. Esc clears. */
export function SearchField({ value, onChange, placeholder, className, autoFocus, ...aria }: SearchFieldProps) {
  const tc = useT('common');
  return (
    <div className={cx('pf-search', className)}>
      <Icon name="search" size={16} className="pf-search__icon" />
      <input
        type="search"
        className="pf-search__input"
        value={value}
        placeholder={placeholder ?? tc('search')}
        aria-label={aria['aria-label'] ?? placeholder ?? tc('search')}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && value) {
            e.preventDefault();
            e.stopPropagation();
            onChange('');
          }
        }}
      />
      {value && (
        <button type="button" className="pf-search__clear" aria-label={tc('clear')} onClick={() => onChange('')}>
          <Icon name="close" size={12} />
        </button>
      )}
    </div>
  );
}
