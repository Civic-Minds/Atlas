import type { CSSProperties } from 'react';
import { PanelBody } from '../../components/ui/Panel';
import StudioPanel from './StudioPanel';
import LinkCard from '../../components/ui/LinkCard';
import { STUDIO_CHANGES_TEXT } from '../../../shared/studioWording';
import StudioChips, { type StudioMenu } from './StudioChips';

/**
 * CIV-1883: the page has no data for the agency Studio is on. The agency stays chosen (Ryan: "The city should be
 * persistent"); the panel says so plainly and lists the agencies this page does have, each one a way to switch.
 */
export default function StudioNoData({ agencyName, options, onPick, agencyMenu, headerPortal, frameStyle }: {
  agencyName: string;
  options: ReadonlyArray<readonly [string, string]>;
  onPick: (slug: string) => void;
  agencyMenu: StudioMenu | null;
  headerPortal: Element | null;
  frameStyle: CSSProperties;
}) {
  return (
    <>
      <StudioChips container={headerPortal} menus={[agencyMenu]} />
      <StudioPanel style={frameStyle} aria-label={STUDIO_CHANGES_TEXT.noDataFor(agencyName)}>
        <PanelBody className="px-4 pt-4 pb-4">
          <p className="m-0 mb-3 text-sm font-bold">{STUDIO_CHANGES_TEXT.noDataFor(agencyName)}</p>
          <div className="space-y-2">
            {options.map(([slug, name]) => <LinkCard key={slug} as="button" onClick={() => onPick(slug)} icon="chevron">{name}</LinkCard>)}
          </div>
        </PanelBody>
      </StudioPanel>
    </>
  );
}
