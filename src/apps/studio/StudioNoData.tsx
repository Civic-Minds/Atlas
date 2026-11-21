import { useEffect, type CSSProperties } from 'react';
import { usePageMapOverlay } from '../../context/PageMapOverlay';
import { useStudioMapFrame } from '../../context/StudioMapFrame';
import { PanelBody } from '../../components/ui/Panel';
import StudioPanel from '../../components/ui/WidePanel';
import PanelEmpty from '../../components/ui/PanelEmpty';
import { AgencyList, AgencyListRow } from '../../components/ui/AgencyList';
import { PANEL_SECTION_HEAD } from '../../styles';
import { studioNoPageDataText, studioPageHasText } from '../../../shared/studioWording';
import StudioChips, { type StudioMenu } from './StudioChips';

/**
 * CIV-1883: the page has no data for the agency Studio is on. The agency stays chosen (Ryan: "The city should be
 * persistent"); the panel says so plainly and lists the agencies this page does have, each one a way to switch.
 * CIV-2054 (Ryan: "This design is not used anywhere else in the app"): the list is the app's agency list rows, under
 * "Live has:", with each agency's full name and place from the shared name source.
 */
export default function StudioNoData({ pageName, agencyName, rows, onPick, agencyMenu, headerPortal, frameStyle, frameTo }: {
  pageName: string;
  /** The chosen agency's full name. */
  agencyName: string;
  rows: ReadonlyArray<{ slug: string; primary: string; secondary?: string }>;
  onPick: (slug: string) => void;
  agencyMenu: StudioMenu | null;
  headerPortal: Element | null;
  frameStyle: CSSProperties;
  /** CIV-2054: the city's corners (longitude, latitude), so the map moves to it though the note draws nothing. */
  frameTo?: readonly [number, number][] | null;
}) {
  const line = studioNoPageDataText(pageName, agencyName);
  // The map goes to the city as on every other page, through the page overlay's own framing (frameKey per agency).
  const { setOverlay } = usePageMapOverlay();
  const { frameKey, framedMemory } = useStudioMapFrame();
  useEffect(() => {
    if (!frameTo?.length) return;
    setOverlay({ layer: { kind: 'lines', lines: [], frameTo }, selected: null, onPick: () => {}, frameKey, framedMemory });
  }, [setOverlay, frameTo, frameKey, framedMemory]);
  useEffect(() => () => setOverlay(null), [setOverlay]);
  return (
    <>
      <StudioChips container={headerPortal} menus={[agencyMenu]} />
      <StudioPanel style={frameStyle} aria-label={line}>
        <PanelBody>
          <PanelEmpty>{line}</PanelEmpty>
          {rows.length > 0 && (
            <>
              <div className={PANEL_SECTION_HEAD}>{studioPageHasText(pageName)}</div>
              <AgencyList>
                {rows.map(r => <AgencyListRow key={r.slug} primary={r.primary} secondary={r.secondary} onClick={() => onPick(r.slug)} />)}
              </AgencyList>
            </>
          )}
        </PanelBody>
      </StudioPanel>
    </>
  );
}
