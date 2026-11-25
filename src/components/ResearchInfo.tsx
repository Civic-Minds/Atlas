import { BACK_PLACES } from '../content/backLinks';
import type { ReactNode } from 'react';
import Panel from './ui/Panel';
import { CARD_HEADER_ONLY, CARD_SUMMARY, CARD_TITLE } from './Interval/cardUi';
import { CardBackLink } from './CardBack';
import { SIDEBAR_CARD, SIDEBAR_CARD_MAX_H, SIDEBAR_PANEL_WIDTH } from '../styles';
import { useSidebarFrame } from '../context/SidebarFrame';
import { useViewport } from '../context/ViewportContext';
import { shouldLoadAgencyDetails } from '../hooks/useAgencyData';
import PanelEmpty from './ui/PanelEmpty';
import { ZOOM_IN_TO_SEE_ROUTES } from '../content/noticeCopy';

/**
 * #1817: below the detail zoom a research view loads no route data, so it draws no route at all (not just the less
 * frequent ones); a search loads them at any zoom.
 */
export function useResearchZoomedOut(query: string): boolean {
  const { zoom } = useViewport();
  return !shouldLoadAgencyDetails(zoom ?? undefined, query);
}

/** A research view with no list of its own (Frequent Service): a card under the info card saying to zoom in, while zoomed out. */
export function ResearchZoomInCard({ query }: { query: string }) {
  if (!useResearchZoomedOut(query)) return null;
  return <Panel enter sidebarSurface className="shrink-0"><PanelEmpty>{ZOOM_IN_TO_SEE_ROUTES}</PanelEmpty></Panel>;
}

/**
 * The one info card every research view (Night, Frequent Service, future ones) shows in the same place
 * with the same look: a heading and the rule in plain words, with the numbers the viewer has selected.
 * Always visible; its "← Frequency map" back link leaves the research view for the main map at the same
 * spot (CIV-929). Counts live in the map's stat pills, not here.
 * A view's own panel (e.g. Night's route list) goes in `below`, as a separate card under it.
 */
export default function ResearchInfo({ heading, children, onBack, hidden = false, below }: {
  heading: string;
  onBack: () => void;
  children: ReactNode;
  /** Hide while a route is selected and its card is showing. */
  hidden?: boolean;
  below?: ReactNode;
}) {
  const { style } = useSidebarFrame();
  return (
    <div
      className={`${SIDEBAR_CARD} ${SIDEBAR_PANEL_WIDTH} flex flex-col gap-2 ${SIDEBAR_CARD_MAX_H} ${hidden ? 'invisible pointer-events-none' : 'pointer-events-auto'}`}
      style={style}
    >
      <Panel enter sidebarSurface className="shrink-0">
        <div className={CARD_HEADER_ONLY}>
          <CardBackLink onClick={onBack}>{BACK_PLACES.frequencyMap}</CardBackLink>
          <p className={CARD_TITLE}>{heading}</p>
          {/* The rule reads like a card's facts line under its title (CIV-971). */}
          <p className={CARD_SUMMARY}>{children}</p>
        </div>
      </Panel>
      {below}
    </div>
  );
}
