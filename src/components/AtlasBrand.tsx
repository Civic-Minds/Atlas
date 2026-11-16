import { ATLAS_MODE } from '../../shared/config';
import { headerModeTag } from '../content/noticeCopy';

const MODE_TAG = headerModeTag(ATLAS_MODE);

// TEMPORARY (CIV-1692 review): ?tag=1..5 picks a look on the dev server only. Removed once Ryan picks one.
const TAG_VARIANT = (() => {
  if (!import.meta.env.DEV || typeof window === 'undefined') return '1';
  const v = new URLSearchParams(window.location.search).get('tag');
  return v && /^[1-5]$/.test(v) ? v : '1';
})();

/** Wordmark only; use AtlasLogo for the logo. Same look at every width. page: the larger wordmark used in the content-page header, sized against its nav links. */
export default function AtlasBrand({ size = 'compact', hideByline = false }: { size?: 'compact' | 'page'; hideByline?: boolean }) {
  const page = size === 'page';
  const nameSize = page ? 'text-lg' : 'text-sm';
  const bylineText = page ? 'text-[13px] leading-none text-[var(--text-muted)]' : 'text-2xs leading-none text-[var(--text-dim)]';
  const v = MODE_TAG ? TAG_VARIANT : null;
  // Variant 3 swaps the byline line: "by Civic Minds · Internal" where the byline shows, just "Internal" where it is hidden (phones).
  const byline = v === '3' ? (
    <span className={`${bylineText} whitespace-nowrap`}>
      <span className={hideByline ? 'hidden sm:inline' : ''}>by Civic Minds<span aria-hidden="true"> · </span></span>
      <span className="font-bold text-[var(--text-secondary)]">{MODE_TAG}</span>
    </span>
  ) : (
    <span className={`${bylineText} ${hideByline ? 'hidden sm:block' : ''}`}>by Civic Minds</span>
  );
  return (
    <span className="inline-flex items-center gap-2">
      {/* items-start + text-left: inside the map header's home <button> the lines were centred to each other. */}
      <span className="flex flex-col items-start gap-px text-left">
        <span className={`${nameSize} leading-none font-black text-[var(--text-primary)] whitespace-nowrap`}>
          Atlas
          {/* 1: the word on the wordmark's line, same font and size, lighter weight and muted. */}
          {v === '1' && <span className="font-medium text-[var(--text-muted)]"> {MODE_TAG}</span>}
          {/* 2: small accent-coloured word raised beside the wordmark, like a superscript. */}
          {v === '2' && <span className={`ml-0.5 relative -top-[0.45em] ${page ? 'text-xs' : 'text-2xs'} leading-none font-bold text-[var(--accent)]`}>{MODE_TAG}</span>}
        </span>
        {byline}
      </span>
      {/* 4: a small coloured dot, then the word in the byline's text. */}
      {v === '4' && (
        <span className={`inline-flex items-center gap-1 ${page ? 'text-[13px]' : 'text-xs'} leading-none font-bold text-[var(--text-secondary)]`}>
          <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-[var(--status-caution)]" />
          {MODE_TAG}
        </span>
      )}
      {/* 5: a thin divider line, then the word at the wordmark's size in muted text. */}
      {v === '5' && (
        <span className={`self-stretch flex items-center border-l border-[var(--border-primary)] pl-2 ${nameSize} leading-none font-medium text-[var(--text-muted)]`}>
          {MODE_TAG}
        </span>
      )}
    </span>
  );
}
