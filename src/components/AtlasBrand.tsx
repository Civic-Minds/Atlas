import { ATLAS_MODE } from '../../shared/config';
import ModeTag from './ModeTag';
import { siteModeLabel } from '../../shared/siteMode';

const MODE_TAG = siteModeLabel(ATLAS_MODE);

/** Wordmark only; use AtlasLogo for the logo. Same look at every width. page: the larger wordmark used in the content-page header, sized against its nav links. */
export default function AtlasBrand({ size = 'compact', hideByline = false }: { size?: 'compact' | 'page'; hideByline?: boolean }) {
  const page = size === 'page';
  return (
    <span className="inline-flex items-center gap-2">
      {/* items-start + text-left: inside the map header's home <button> the lines were centred to each other.
          With a mode word (CIV-1692) the lines are right-aligned instead, so "by Civic Minds" ends under the word. */}
      <span className={`flex flex-col ${MODE_TAG ? 'items-end text-right' : 'items-start text-left'} gap-px`}>
        <span className={`${page ? 'text-lg' : 'text-sm'} leading-none font-black text-[var(--text-primary)] whitespace-nowrap`}>
          Atlas
          {/* CIV-1692 (Ryan, option 1): the word on the wordmark's line, same font and size, lighter weight and muted. */}
          {MODE_TAG && <ModeTag word={MODE_TAG} />}
        </span>
        <span className={`${page ? 'text-[13px] leading-none text-[var(--text-muted)]' : 'text-2xs leading-none text-[var(--text-dim)]'} ${hideByline ? 'hidden sm:block' : ''}`}>by Civic Minds</span>
      </span>
    </span>
  );
}
