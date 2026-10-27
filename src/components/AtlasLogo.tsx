import { Map as MapIcon } from 'lucide-react';
import AtlasBrand from './AtlasBrand';
import { TOP_BAR_SURFACE } from '../styles';

// The one Atlas logo: pale disc with an accent icon, plus the "Atlas / by Civic Minds" wordmark.
// Every surface uses this component so the logo looks the same on every device (#1058, CIV-508).
// Props only choose the link target, the label, and which parts show; never add per-width
// (sm:/max-sm:) classes that change how the logo looks.
const RING = 'rounded-full focus:outline-none focus-visible:!outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-border)]';
// With the disc the link is an inline row. Wordmark-only (content pages, Live header) stays a plain inline link, so its box matches the text and not the whole column.
const LINK_CLASS = `group inline-flex items-center gap-2 shrink-0 ${RING}`;
const WORD_LINK_CLASS = `group ${RING}`;

type Props = {
  ariaLabel: string;
  /** Renders a link. Without it the logo is a button and needs onClick. */
  href?: string;
  onClick?: () => void;
  /** Show the round map icon. Content pages use the larger wordmark without it. */
  showMark?: boolean;
  size?: 'compact' | 'page';
  hideByline?: boolean;
  hideWordmark?: boolean;
};

export default function AtlasLogo({ ariaLabel, href, onClick, showMark = true, size = 'compact', hideByline = false, hideWordmark = false }: Props) {
  const content = (
    <>
      {showMark && (
        <span className={`w-8 h-8 ${TOP_BAR_SURFACE} rounded-full flex items-center justify-center shrink-0 group-hover:opacity-80 transition-opacity`}>
          <MapIcon className="w-3.5 h-3.5 text-[var(--accent)]" aria-hidden="true" />
        </span>
      )}
      {!hideWordmark && <AtlasBrand size={size} hideByline={hideByline} />}
    </>
  );
  const cls = showMark ? LINK_CLASS : WORD_LINK_CLASS;
  if (href) return <a href={href} aria-label={ariaLabel} className={cls}>{content}</a>;
  return <button type="button" onClick={onClick} aria-label={ariaLabel} className={cls}>{content}</button>;
}
