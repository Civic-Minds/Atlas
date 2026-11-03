import { MAP_BADGE_LABEL } from '../styles';
import { OutboundLink } from './OutboundLink';

const ATTRIB_LINK = `${MAP_BADGE_LABEL} text-[var(--text-dim)] no-underline hover:text-[var(--text-primary)]`;

/** The basemap's credit: linked OpenStreetMap and CARTO, as their terms ask. The main map's footer pill and the Frequent story's map (CIV-1168). */
export function BasemapCredit({ className = '' }: { className?: string }) {
  return (
    <p className={`${MAP_BADGE_LABEL} whitespace-nowrap ${className}`.trim()}>
      <OutboundLink href="https://www.openstreetmap.org/copyright" kind="attribution" className={ATTRIB_LINK}>OpenStreetMap</OutboundLink>
      <span className={MAP_BADGE_LABEL}> · </span>
      <OutboundLink href="https://carto.com/attributions" kind="attribution" className={ATTRIB_LINK}>CARTO</OutboundLink>
    </p>
  );
}
