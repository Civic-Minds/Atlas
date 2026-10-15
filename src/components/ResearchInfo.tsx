import type { ReactNode } from 'react';
import { LIST_ROW_PRIMARY } from '../styles';

/**
 * The one info block every research view (Night, Frequent Service, future ones) shows: a heading and
 * the rule in plain words, with the numbers the viewer has selected. Always visible, no close button.
 * Counts live in the map's stat pills, not here.
 */
export default function ResearchInfo({ heading, children, bordered = true, className = '' }: { heading: string; children: ReactNode; /** A rule under the block, when something follows it in the same card. */ bordered?: boolean; className?: string }) {
  return (
    <div className={`px-4 pt-2.5 pb-3 ${bordered ? 'border-b border-[var(--border-primary)]' : ''} ${className}`.trim()}>
      <p className={`${LIST_ROW_PRIMARY} leading-snug`}>{heading}</p>
      <p className="mt-1 text-xs text-[var(--text-muted)] font-medium leading-snug">{children}</p>
    </div>
  );
}
