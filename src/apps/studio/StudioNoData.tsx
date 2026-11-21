import type { CSSProperties } from 'react';
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
export default function StudioNoData({ pageName, agencyName, rows, onPick, agencyMenu, headerPortal, frameStyle }: {
  pageName: string;
  /** The chosen agency's full name. */
  agencyName: string;
  rows: ReadonlyArray<{ slug: string; primary: string; secondary?: string }>;
  onPick: (slug: string) => void;
  agencyMenu: StudioMenu | null;
  headerPortal: Element | null;
  frameStyle: CSSProperties;
}) {
  const line = studioNoPageDataText(pageName, agencyName);
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
