import { CONTROL_ACTIVE } from '../../styles';

/**
 * The small round letter that names a compare map ("A", "B", or "A+B" for a filter that changes both).
 * Uses the shared selected tint, not a dark fill. One component, so the side labels on the maps, the
 * phone filter panel and the "Both maps" pill all match.
 */
export function SideBadge({ side }: { side: 'A' | 'B' | 'A+B' }) {
  return (
    <span className={`inline-flex h-4 min-w-4 ${side === 'A+B' ? 'px-1' : 'w-4'} shrink-0 items-center justify-center rounded-full border text-2xs font-black ${CONTROL_ACTIVE}`} aria-hidden="true">
      {side}
    </span>
  );
}
