import React from 'react';
import { titleCase, getRouteLabel, shortenAgencyName } from '../utils/format';

interface Props {
  routeShortName: string | null | undefined;
  routeLongName?: string | null;
  agencyName?: string | null;
  onAgencyClick?: () => void;
}

export default function RouteCardTitle({ routeShortName, routeLongName, agencyName, onAgencyClick }: Props) {
  const title = titleCase(getRouteLabel(routeShortName, routeLongName));
  const displayAgency = agencyName ? shortenAgencyName(agencyName) : null;
  return (
    <div className="flex-1 min-w-0">
      <h3 className="text-sm font-black text-[var(--text-primary)] leading-tight line-clamp-2">{title}</h3>
      {displayAgency && (
        onAgencyClick
          ? (
            <button
              onClick={onAgencyClick}
              className="text-[9px] text-[var(--text-dim)] font-bold tracking-wide uppercase mt-0.5 hover:text-[var(--accent)] transition-colors text-left"
            >
              {displayAgency}
            </button>
          ) : (
            <p className="text-[9px] text-[var(--text-dim)] font-bold tracking-wide uppercase truncate mt-0.5">{displayAgency}</p>
          )
      )}
    </div>
  );
}
