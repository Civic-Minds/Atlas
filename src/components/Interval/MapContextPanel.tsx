import React, { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import type { MapContextAgency } from '../../utils/mapContext';
import { FLOATING_CARD, LIST_ROW, LIST_ROW_PRIMARY, LIST_ROW_DIM, PANEL_TITLE_BAR, PANEL_TITLE, Z_PANEL } from '../../styles';

interface MapContextPanelProps {
  agencies: MapContextAgency[];
  onSelectAgency?: (slug: string) => void;
}

export const MapContextPanel: React.FC<MapContextPanelProps> = ({ agencies, onSelectAgency }) => {
  const [query, setQuery] = useState('');
  const routeCount = useMemo(() => agencies.reduce((total, agency) => total + agency.routeCount, 0), [agencies]);
  const filteredAgencies = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? agencies.filter(agency => agency.name.toLowerCase().includes(q)) : agencies;
  }, [agencies, query]);

  return (
    <div className={`absolute bottom-16 right-3 ${Z_PANEL} w-[min(21rem,calc(100vw-2rem))] max-h-[min(30rem,calc(100vh-8rem))] ${FLOATING_CARD} flex flex-col overflow-hidden pointer-events-auto`}>
      <div className={PANEL_TITLE_BAR}>
        <div className="min-w-0 flex-1">
          <div className={PANEL_TITLE}>In view</div>
          <div className="text-[11px] font-bold text-[var(--text-primary)]">
            {agencies.length} {agencies.length === 1 ? 'agency' : 'agencies'} · {routeCount} {routeCount === 1 ? 'route' : 'routes'}
          </div>
        </div>
      </div>

      {agencies.length > 5 && (
        <label className="mx-3 mt-2 flex h-8 items-center gap-1.5 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-app)] px-2.5">
          <Search className="w-3 h-3 shrink-0 text-[var(--text-dim)]" />
          <input
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Filter agencies"
            aria-label="Filter agencies in view"
            className="min-w-0 flex-1 bg-transparent text-[10px] font-bold text-[var(--text-primary)] placeholder:text-[var(--text-dim)] focus:outline-none"
          />
        </label>
      )}

      <div className="custom-scrollbar overflow-y-auto py-1">
        {filteredAgencies.length > 0 ? filteredAgencies.map(agency => (
          <button
            key={agency.slug}
            type="button"
            onClick={() => onSelectAgency?.(agency.slug)}
            className={`${LIST_ROW} ${onSelectAgency ? 'cursor-pointer' : 'cursor-default'}`}
          >
            <span className={`${LIST_ROW_PRIMARY} min-w-0 truncate text-left`}>{agency.name}</span>
            <span className={`${LIST_ROW_DIM} ml-3 shrink-0`}>{agency.routeCount} {agency.routeCount === 1 ? 'route' : 'routes'}</span>
          </button>
        )) : (
          <div className="px-4 py-3 text-[10px] font-bold text-[var(--text-dim)]">No matching agencies.</div>
        )}
      </div>
    </div>
  );
};
