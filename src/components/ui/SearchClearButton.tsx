import { X } from 'lucide-react';
import { CLEAR_SEARCH_LABEL } from '../../content/noticeCopy';

/**
 * The clear (X) inside a search box, one component for every search box (CIV-1569). It clears on pointer-down so the
 * box keeps focus; a keyboard click (detail 0) clears too. docs/style/VISUAL.md: inside a pill it sits at least `right-2` in from
 * the edge, never flush with the border.
 * - `bar`: the top bar's search box, set absolutely at `right-2`.
 * - `pill`: a `SEARCH_PILL` box, in its flow and never squeezed; the pill's own right padding keeps it in from the edge.
 */
export default function SearchClearButton({ onClear, variant }: { onClear: () => void; variant: 'bar' | 'pill' }) {
  const look = variant === 'bar'
    ? 'absolute right-2 top-1/2 -translate-y-1/2 p-0.5'
    : 'shrink-0';
  return (
    <button
      type="button"
      onPointerDown={event => {
        event.preventDefault();
        onClear();
      }}
      onClick={event => {
        if (event.detail === 0) onClear();
      }}
      className={`${look} text-[var(--text-dim)] hover:text-[var(--text-primary)] transition-colors`.trim()}
      aria-label={CLEAR_SEARCH_LABEL}
    >
      <X className={variant === 'bar' ? 'w-3.5 h-3.5' : 'w-3 h-3'} />
    </button>
  );
}
