import { BACK_PLACES } from '../content/backLinks';
import type { ReactNode } from 'react';
import Panel from './ui/Panel';
import { CARD_HEADER_ONLY, CARD_SUMMARY, CARD_TITLE } from './Interval/cardUi';
import { CardBackLink } from './CardBack';
import { SIDEBAR_CARD, SIDEBAR_CARD_MAX_H, SIDEBAR_PANEL_WIDTH } from '../styles';
import { useSidebarFrame } from '../context/SidebarFrame';

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
