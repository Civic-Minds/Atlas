import type { AnchorHTMLAttributes } from 'react';
import { trackEvent } from '../lib/analytics';

export type OutboundLinkKind = 'agency_website' | 'fares' | 'on_demand_source' | 'coverage_note' | 'attribution' | 'published_map';

type Props = AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
  kind: OutboundLinkKind;
  agencySlug?: string;
};

/** A link that leaves Atlas: opens in a new tab and counts the click as `outbound_click`. */
export function OutboundLink({ kind, agencySlug, onClick, rel = 'noopener noreferrer', target = '_blank', ...rest }: Props) {
  return (
    <a
      {...rest}
      target={target}
      rel={rel}
      onClick={(event) => {
        trackEvent('outbound_click', { kind, agency_slug: agencySlug });
        onClick?.(event);
      }}
    />
  );
}
