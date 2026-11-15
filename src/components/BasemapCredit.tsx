import type { ReactNode } from 'react';
import { MAP_BADGE_LABEL } from '../styles';
import { OutboundLink } from './OutboundLink';

/** One linked name in the credit; a credit added after CARTO (`extra`) uses it too. */
export const BASEMAP_CREDIT_LINK = `${MAP_BADGE_LABEL} text-[var(--text-dim)] no-underline hover:text-[var(--text-primary)]`;

/** The basemap's credit: linked OpenStreetMap and CARTO, as their terms ask. The main map's footer pill and the Frequent story's map (CIV-1168).
 *  `extra` is one more linked credit after them (the beta neighbourhood shading's census credit, CIV-524). */
export function BasemapCredit({ className = '', extra }: { className?: string; extra?: ReactNode }) {
  return (
    <p className={`${MAP_BADGE_LABEL} whitespace-nowrap ${className}`.trim()}>
      <OutboundLink href="https://www.openstreetmap.org/copyright" kind="attribution" className={BASEMAP_CREDIT_LINK}>OpenStreetMap</OutboundLink>
      <span className={MAP_BADGE_LABEL}> · </span>
      <OutboundLink href="https://carto.com/attributions" kind="attribution" className={BASEMAP_CREDIT_LINK}>CARTO</OutboundLink>
      {extra && <><span className={MAP_BADGE_LABEL}> · </span>{extra}</>}
    </p>
  );
}
