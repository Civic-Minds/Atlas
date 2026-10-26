import type { CSSProperties, ReactNode } from 'react';
import Panel from './ui/Panel';
import { LIST_ROW_PRIMARY, SIDEBAR_CARD, SIDEBAR_CARD_MAX_H, SIDEBAR_LEFT_FALLBACK, SIDEBAR_PANEL_WIDTH } from '../styles';

/**
 * The one info card every research view (Night, Frequent Service, future ones) shows in the same place
 * with the same look: a heading and the rule in plain words, with the numbers the viewer has selected.
 * Always visible, no close button. Counts live in the map's stat pills, not here.
 * A view's own panel (e.g. Night's route list) goes in `below`, as a separate card under it.
 */
export default function ResearchInfo({ heading, children, sidebarLeft, hidden = false, below }: {
  heading: string;
  children: ReactNode;
  sidebarLeft?: number | null;
  /** Hide while a route is selected and its card is showing. */
  hidden?: boolean;
  below?: ReactNode;
}) {
  return (
    <div
      className={`${SIDEBAR_CARD} ${SIDEBAR_PANEL_WIDTH} flex flex-col gap-2 ${SIDEBAR_CARD_MAX_H} ${hidden ? 'invisible pointer-events-none' : 'pointer-events-auto'}`}
      style={{ '--sidebar-left': `${sidebarLeft ?? SIDEBAR_LEFT_FALLBACK}px` } as CSSProperties}
    >
      <Panel enter sidebarSurface className="shrink-0">
        <div className="px-4 pt-2.5 pb-3">
          <p className={`${LIST_ROW_PRIMARY} leading-snug`}>{heading}</p>
          <p className="mt-1 text-xs text-[var(--text-muted)] font-medium leading-snug">{children}</p>
        </div>
      </Panel>
      {below}
    </div>
  );
}
