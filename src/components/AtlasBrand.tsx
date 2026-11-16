import { ATLAS_MODE } from '../../shared/config';
import { headerModeTag } from '../content/noticeCopy';

const MODE_TAG = headerModeTag(ATLAS_MODE);

/** Wordmark only; use AtlasLogo for the logo. Same look at every width. page: the larger wordmark used in the content-page header, sized against its nav links. */
export default function AtlasBrand({ size = 'compact', hideByline = false }: { size?: 'compact' | 'page'; hideByline?: boolean }) {
  const page = size === 'page';
  // Byline's size and colour, so the tag reads as plain text beside the wordmark (CIV-1692, Ryan: "plain text not a pill").
  const bylineText = page ? 'text-[13px] leading-none text-[var(--text-muted)]' : 'text-2xs leading-none text-[var(--text-dim)]';
  return (
    <span className="inline-flex items-center gap-2">
      {/* items-start + text-left: inside the map header's home <button> the lines were centred to each other. */}
      <span className="flex flex-col items-start gap-px text-left">
        <span className={`${page ? 'text-lg' : 'text-sm'} leading-none font-black text-[var(--text-primary)]`}>Atlas</span>
        <span className={`${bylineText} ${hideByline ? 'hidden sm:block' : ''}`}>by Civic Minds</span>
      </span>
      {/* CIV-1692: beside the two lines, not in the byline, so it still shows on phones where the byline is hidden. */}
      {MODE_TAG && <span className={bylineText}>{MODE_TAG}</span>}
    </span>
  );
}
