import type { ReactNode } from 'react';
import ModeFilterPill from './ModeFilterPill';

/**
 * The row of mode filter pills under an agency card's heading (the map's agency card and History's agency view).
 * Picking the selected pill again clears the filter. Extra pills (the agency card's On-demand pill) go in `children`,
 * after the mode pills.
 */
export default function ModeFilterPillRow<K extends string>({ filters, selected, onSelect, children }: {
  filters: ReadonlyArray<{ key: K; label: string; count: number }>;
  /** The selected mode, or null when none is (or another pill in `children` is). */
  selected: K | null;
  /** The new filter: the picked mode, or null when the selected one is picked again. */
  onSelect: (key: K | null) => void;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {filters.map(filter => {
        const on = selected === filter.key;
        return (
          <ModeFilterPill
            key={filter.key}
            onClick={() => onSelect(on ? null : filter.key)}
            selected={on}
            label={filter.label}
            count={filter.count}
          />
        );
      })}
      {children}
    </div>
  );
}
