import { forwardRef } from 'react';
import { MAP_ERRORS_PILL, MAP_ERRORS_TITLE } from '../../content/noticeCopy';
import { MAP_BADGE, PANEL_TITLE, sidebarFrameStyle } from '../../styles';
import ListRow from '../ui/ListRow';
import Panel, { PanelBody, PanelTitleBar } from '../ui/Panel';

/**
 * Phones (CIV-1057): the map's error notices as one "Error" pill in the footer row, right of the loading pill (in its
 * spot when there is none), so they never stack. A tap opens MapErrorsPanel.
 */
export function MapErrorsPill({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-expanded={open}
      onClick={onToggle}
      data-map-errors-pill
      className={`${MAP_BADGE} h-8 max-sm:h-[32px] px-3 py-1.5 text-xs text-[var(--text-muted)] cursor-pointer`}
    >
      {MAP_ERRORS_PILL}
    </button>
  );
}

/**
 * The list the "Error" pill opens: a card in the left card slot where Near You opens (CIV-930), from the same card
 * pieces, closed the same way (a tap outside it). It keeps the messages it opened with, so a hint that times out
 * doesn't empty it mid-read.
 */
export const MapErrorsPanel = forwardRef<HTMLDivElement, { messages: readonly string[]; sidebarLeft?: number; searchBarWidth?: number }>(
  function MapErrorsPanel({ messages, sidebarLeft, searchBarWidth }, ref) {
    return (
      <Panel sidebar enter ref={ref} style={sidebarFrameStyle(sidebarLeft, searchBarWidth)} data-testid="map-errors-panel">
        <PanelTitleBar>
          <span className={PANEL_TITLE}>{MAP_ERRORS_TITLE}</span>
        </PanelTitleBar>
        <PanelBody>
          {messages.map(message => (
            <ListRow key={message} as="div" variant="spaced" className="text-xs text-[var(--text-muted)] cursor-default">{message}</ListRow>
          ))}
        </PanelBody>
      </Panel>
    );
  },
);
