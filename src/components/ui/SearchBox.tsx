import type { Ref } from 'react';
import { Search } from 'lucide-react';
import { SEARCH_FIELD, SEARCH_ICON, SEARCH_PILL } from '../../styles';
import SearchClearButton from './SearchClearButton';

/**
 * The one pill-shaped search box (CIV-1607): magnifier, text field and the clear (X), which shows once there is text.
 * Every search box is this component, so each has the same look and a clear X (docs/style/VISUAL.md); the top bar's
 * box is the one exception, built in App.tsx for its phone hint and results keys, and it uses SearchClearButton too.
 * `placeholder` is a "Find …" hint from searchPlaceholder (noticeCopy.ts); it also names the field to screen readers.
 */
export default function SearchBox({ value, onChange, placeholder, inputRef, autoFocus = false, className = '' }: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  inputRef?: Ref<HTMLInputElement>;
  autoFocus?: boolean;
  className?: string;
}) {
  return (
    <label className={className ? `${SEARCH_PILL} ${className}` : SEARCH_PILL}>
      <Search className={SEARCH_ICON} />
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={event => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className={SEARCH_FIELD}
        autoFocus={autoFocus}
      />
      {value && <SearchClearButton variant="pill" onClear={() => onChange('')} />}
    </label>
  );
}
