import React, { useEffect, useMemo, useState } from 'react';
import { Moon, Search, X } from 'lucide-react';
import {
  FLOATING_CARD,
  PANEL_ENTER,
  PANEL_TITLE_BAR,
  PANEL_TITLE,
  PANEL_BODY,
  PANEL_EMPTY,
  SEARCH_PILL,
  SEARCH_FIELD,
  Z_PANEL,
  SIDEBAR_LEFT_FALLBACK,
  SIDEBAR_PANEL_WIDTH,
} from '../styles';
import RouteListRow from '../components/RouteListRow';
import { R2_PUBLIC_URL } from '../../shared/config';

interface NightServiceRoute {
  agencySlug: string;
  agencyName: string;
  region: string | null;
  routeShortName: string | null;
  routeLongName: string | null;
  directionId: number | null;
  headsign: string | null;
}

interface NightServiceIndexFile {
  criteria: string;
  agencyCount: number;
  routeCount: number;
  routes: NightServiceRoute[];
}

interface Props {
  active?: boolean;
  sidebarLeft?: number;
}

export default function NightService({ active, sidebarLeft }: Props) {
  const [data, setData] = useState<NightServiceIndexFile | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [filterQuery, setFilterQuery] = useState('');

  useEffect(() => {
    fetch(`${R2_PUBLIC_URL}/atlas/night-service.json`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((json: NightServiceIndexFile) => {
        setData(json);
        setLoadState('ready');
      })
      .catch(() => setLoadState('error'));
  }, []);

  const agencies = useMemo(() => {
    if (!data) return [];
    const byAgency = new Map<string, { agencyName: string; region: string | null; routes: NightServiceRoute[] }>();
    for (const route of data.routes) {
      const entry = byAgency.get(route.agencySlug) ?? { agencyName: route.agencyName, region: route.region, routes: [] };
      entry.routes.push(route);
      byAgency.set(route.agencySlug, entry);
    }
    const q = filterQuery.trim().toLowerCase();
    const list = [...byAgency.entries()].map(([slug, entry]) => ({ slug, ...entry }));
    if (!q) return list;
    return list
      .map(agency => ({
        ...agency,
        routes: agency.routes.filter(r =>
          agency.agencyName.toLowerCase().includes(q) ||
          (r.routeShortName ?? '').toLowerCase().includes(q) ||
          (r.routeLongName ?? '').toLowerCase().includes(q)
        ),
      }))
      .filter(agency => agency.agencyName.toLowerCase().includes(q) || agency.routes.length > 0);
  }, [data, filterQuery]);

  if (!active) return null;

  return (
      <div
        className={`absolute top-[4.5rem] left-6 sm:left-[var(--sidebar-left)] ${Z_PANEL} ${SIDEBAR_PANEL_WIDTH} max-h-[calc(100vh-104px)] flex flex-col pointer-events-auto ${FLOATING_CARD} ${PANEL_ENTER} overflow-hidden`}
        style={{ '--sidebar-left': `${sidebarLeft ?? SIDEBAR_LEFT_FALLBACK}px` } as React.CSSProperties}
      >
        <div className={PANEL_TITLE_BAR}>
          <Moon className="w-3 h-3 text-[var(--text-dim)] shrink-0" />
          <span className={PANEL_TITLE}>Night Service</span>
        </div>

        {data && (
          <p className="px-4 pt-2 pb-1 text-[10px] text-[var(--text-dim)] font-bold leading-snug border-b border-[var(--border-primary)]">
            {data.criteria}
          </p>
        )}

        <div className="p-3 border-b border-[var(--border-primary)] shrink-0">
          <div className={SEARCH_PILL}>
            <Search className="w-3.5 h-3.5 text-[var(--text-dim)] shrink-0" />
            <input
              className={SEARCH_FIELD}
              placeholder="Find an agency or route"
              value={filterQuery}
              onChange={e => setFilterQuery(e.target.value)}
            />
            {filterQuery && (
              <button onClick={() => setFilterQuery('')} aria-label="Clear search">
                <X className="w-3.5 h-3.5 text-[var(--text-dim)] hover:text-[var(--text-primary)]" />
              </button>
            )}
          </div>
        </div>

        <div className={PANEL_BODY}>
          {loadState === 'loading' && <p className={PANEL_EMPTY}>Loading…</p>}
          {loadState === 'error' && <p className={PANEL_EMPTY}>Couldn't load night service data.</p>}
          {loadState === 'ready' && agencies.length === 0 && (
            <p className={PANEL_EMPTY}>No agencies match that search.</p>
          )}
          {loadState === 'ready' && agencies.map(agency => (
            <div key={agency.slug}>
              <div className="px-4 pt-2.5 pb-1 text-[10px] font-black text-[var(--text-primary)]">
                {agency.agencyName}
                {agency.region && <span className="font-normal text-[var(--text-dim)] ml-1">· {agency.region}</span>}
              </div>
              {agency.routes.map((route, i) => (
                <RouteListRow
                  key={`${route.routeShortName ?? ''}-${route.directionId ?? ''}-${i}`}
                  shortName={route.routeShortName ?? '—'}
                  name={route.headsign ?? undefined}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
  );
}
