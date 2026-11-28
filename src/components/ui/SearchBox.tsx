import type { Ref } from 'react';
import { Search } from 'lucide-react';
import { SEARCH_FIELD, SEARCH_ICON, SEARCH_PILL } from '../../styles';
import SearchClearButton from './SearchClearButton';
import Tag from './Tag';

/**
 * The one pill-shaped search box (CIV-1607): magnifier, text field and the clear (X), which shows once there is text.
 * Every search box is this component, so each has the same look and a clear X (docs/style/VISUAL.md); the top bar's
 * box is the one exception, built in App.tsx for its phone hint and results keys, and it uses SearchClearButton too.
 * `placeholder` is a "Find …" hint from searchPlaceholder (noticeCopy.ts); it also names the field to screen readers.
 */
export default function SearchBox({ value, onChange, placeholder, inputRef, autoFocus = false, className = '', chip }: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  inputRef?: Ref<HTMLInputElement>;
  autoFocus?: boolean;
  className?: string;
  /** CIV-3142 mock-up: a filter already set in the box (Sources' "On my screen"); the box's X clears it with the text. */
  chip?: { label: string; onClear: () => void };
}) {
  return (
    <label className={className ? `${SEARCH_PILL} ${className}` : SEARCH_PILL}>
      <Search className={SEARCH_ICON} />
      {chip && <Tag className="shrink-0 whitespace-nowrap">{chip.label}</Tag>}
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={event => onChange(event.target.value)}
        placeholder={chip ? '' : placeholder}
        aria-label={placeholder}
        className={SEARCH_FIELD}
        autoFocus={autoFocus}
      />
      {(value || chip) && <SearchClearButton variant="pill" onClear={() => { onChange(''); chip?.onClear(); }} />}
    </label>
  );
}
