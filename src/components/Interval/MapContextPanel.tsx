import React, { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import type { MapContextAgency, MapContextRoute } from '../../utils/mapContext';
import { getRouteLabel, titleCase } from '../../utils/format';
import { FLOATING_CARD, LIST_ROW_SPACED, LIST_ROW_PRIMARY, LIST_ROW_DIM, PANEL_TITLE_BAR, PANEL_TITLE, Z_PANEL } from '../../styles';

interface MapContextPanelProps {
  agencies: MapContextAgency[];
  mode: 'agencies' | 'routes';
  onSelectAgency?: (slug: string) => void;
  onSelectRoute?: (key: string) => void;
}

export const MapContextPanel: React.FC<MapContextPanelProps> = ({ agencies, mode, onSelectAgency, onSelectRoute }) => {
  const [query, setQuery] = useState('');
  const routes = useMemo(() => agencies.flatMap(agency => agency.routes), [agencies]);
  const count = mode === 'agencies' ? agencies.length : routes.length;
  const filteredAgencies = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? agencies.filter(agency => agency.name.toLowerCase().includes(q)) : agencies;
  }, [agencies, query]);
  const filteredRoutes = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q
      ? routes.filter(route => [route.shortName, route.longName, route.agencyName].some(value => value?.toLowerCase().includes(q)))
      : routes;
  }, [query, routes]);

  return (
    <div className={`absolute bottom-[9rem] right-3 ${Z_PANEL} w-[min(21rem,calc(100vw-2rem))] max-h-[min(30rem,calc(100vh-11rem))] ${FLOATING_CARD} flex flex-col overflow-hidden pointer-events-auto`}>
      <div className={PANEL_TITLE_BAR}>
        <div className="min-w-0 flex-1">
          <div className={PANEL_TITLE}>In view</div>
          <div className="text-[11px] font-bold text-[var(--text-primary)]">
            {count} {count === 1 ? (mode === 'agencies' ? 'agency' : 'route') : (mode === 'agencies' ? 'agencies' : 'routes')}
          </div>
        </div>
      </div>

      {(mode === 'agencies' ? agencies.length : routes.length) > 5 && (
        <label className="mx-3 mt-2 flex h-8 items-center gap-1.5 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-app)] px-2.5">
          <Search className="w-3 h-3 shrink-0 text-[var(--text-dim)]" />
          <input
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder={mode === 'agencies' ? 'Filter agencies' : 'Filter routes'}
            aria-label={mode === 'agencies' ? 'Filter agencies in view' : 'Filter routes in view'}
            className="min-w-0 flex-1 bg-transparent text-[10px] font-bold text-[var(--text-primary)] placeholder:text-[var(--text-dim)] focus:outline-none"
          />
        </label>
      )}

      <div className="custom-scrollbar overflow-y-auto py-1">
        {mode === 'agencies' ? (
          filteredAgencies.length > 0 ? filteredAgencies.map(agency => (
            <button
              key={agency.slug}
              type="button"
              onClick={() => onSelectAgency?.(agency.slug)}
              className={`${LIST_ROW_SPACED} ${onSelectAgency ? 'cursor-pointer' : 'cursor-default'}`}
            >
              <span className={`${LIST_ROW_PRIMARY} min-w-0 truncate text-left`}>{agency.name}</span>
            </button>
          )) : (
            <div className="px-4 py-3 text-[10px] font-bold text-[var(--text-dim)]">No matching agencies.</div>
          )
        ) : (
          filteredRoutes.length > 0 ? filteredRoutes.map((route: MapContextRoute) => (
            <button
              key={route.key}
              type="button"
              onClick={() => onSelectRoute?.(route.key)}
              className={`${LIST_ROW_SPACED} ${onSelectRoute ? 'cursor-pointer' : 'cursor-default'}`}
            >
              <span className="min-w-0 text-left">
                <span className={`${LIST_ROW_PRIMARY} block truncate`}>{titleCase(getRouteLabel(route.shortName, route.longName))}</span>
                <span className={`${LIST_ROW_DIM} block truncate mt-0.5`}>{route.agencyName}</span>
              </span>
            </button>
          )) : (
            <div className="px-4 py-3 text-[10px] font-bold text-[var(--text-dim)]">No matching routes.</div>
          )
        )}
      </div>
    </div>
  );
};
