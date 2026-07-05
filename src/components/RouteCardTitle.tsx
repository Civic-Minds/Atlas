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
      {displayAgency && (
        onAgencyClick
          ? (
            <button
              onClick={onAgencyClick}
              className="text-xs font-bold text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors text-left leading-tight block mb-0.5"
            >
              {displayAgency}
            </button>
          ) : (
            <p className="text-xs font-bold text-[var(--text-muted)] leading-tight mb-0.5 truncate">{displayAgency}</p>
          )
      )}
      <h3 className="text-sm font-black text-[var(--text-primary)] leading-tight line-clamp-2">{title}</h3>
    </div>
  );
}
