import type { ReactNode } from 'react';

const BACK = 'text-sm font-bold text-[var(--text-primary)] hover:underline';

/**
 * Live's way back to the agency ("← TTC"): the Live map's route panel (a button back to the network) and every Live route
 * page (a link to the agency page), one look and wording (CIV-1446).
 */
export default function LiveBackLink({ agencyName, href, onClick, className = '' }: {
  agencyName: ReactNode;
  /** The agency page, for a link. */
  href?: string;
  /** In place of `href`: a button (the Live map's panel). */
  onClick?: () => void;
  className?: string;
}) {
  const text = <>← {agencyName}</>;
  return href != null
    ? <a href={href} className={`${BACK} ${className}`}>{text}</a>
    : <button type="button" onClick={onClick} className={`${BACK} text-left ${className}`}>{text}</button>;
}
