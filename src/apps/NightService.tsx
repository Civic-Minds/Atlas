import React, { useEffect, useMemo, useState } from 'react';
import { Moon, Search, X } from 'lucide-react';
import { getNightServiceColor } from '../utils/colors';
import { useColorVision } from '../context/ColorVisionContext';
import { useViewport } from '../context/ViewportContext';
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

interface NightServiceRouteSummary {
  routeShortName: string | null;
  routeLongName: string | null;
  destinations: string[];
}

interface NightServiceFeatureProperties {
  nightService?: boolean;
  routeShortName?: string | null;
  routeLongName?: string | null;
  headsign?: string | null;
  agencyName?: string | null;
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
  layers: Record<string, GeoJSON.FeatureCollection>;
  query?: string;
}

function featureIntersectsBounds(feature: GeoJSON.Feature, bounds: { s: number; w: number; n: number; e: number }): boolean {
  if (feature.geometry.type !== 'LineString' && feature.geometry.type !== 'MultiLineString') return false;
  const coordinates = feature.geometry.type === 'LineString'
    ? feature.geometry.coordinates
    : feature.geometry.coordinates.flat();
  if (coordinates.length === 0) return false;
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;
  for (const [lon, lat] of coordinates) {
    minLon = Math.min(minLon, lon);
    minLat = Math.min(minLat, lat);
    maxLon = Math.max(maxLon, lon);
    maxLat = Math.max(maxLat, lat);
  }
  return maxLon >= bounds.w && minLon <= bounds.e && maxLat >= bounds.s && minLat <= bounds.n;
}

export default function NightService({ active, sidebarLeft, layers, query = '' }: Props) {
  const { colorVisionFriendly } = useColorVision();
  const colorMode = colorVisionFriendly ? 'friendly' : 'default';
  const [data, setData] = useState<NightServiceIndexFile | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [filterQuery, setFilterQuery] = useState('');
  const { bounds } = useViewport();
  const visibleRoutes = useMemo(() => {
    if (!bounds || Object.keys(layers).length === 0) return [];
    const routes: Array<{ agencySlug: string; properties: NightServiceFeatureProperties }> = [];
    for (const [agencySlug, collection] of Object.entries(layers)) {
      for (const feature of collection.features) {
        const properties = feature.properties as NightServiceFeatureProperties | null;
        if (properties?.nightService !== true || !featureIntersectsBounds(feature, bounds)) continue;
        routes.push({ agencySlug, properties });
      }
    }
    return routes;
  }, [bounds, layers]);
  const [introDismissed, setIntroDismissed] = useState(() => {
    try { return localStorage.getItem('atlas_pref_night_intro_dismissed') === '1'; } catch { return false; }
  });
  const dismissIntro = () => {
    setIntroDismissed(true);
    try { localStorage.setItem('atlas_pref_night_intro_dismissed', '1'); } catch {}
  };

  useEffect(() => {
    fetch(`${R2_PUBLIC_URL}/atlas/night-service.json`, { cache: 'no-store' })
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((json: NightServiceIndexFile) => {
        setData(json);
        setLoadState('ready');
      })
      .catch(() => {
        // The map features are authoritative for what is visible. The index only
        // enriches them with agency regions and destination labels.
        setData({ criteria: '', agencyCount: 0, routeCount: 0, routes: [] });
        setLoadState('ready');
      });
  }, []);

  const agencies = useMemo(() => {
    if (!data) return [];
    const indexRoutes = new Map(data.routes.map(route => [
      `${route.agencySlug}::${route.routeShortName ?? ''}::${route.routeLongName ?? ''}`,
      route,
    ]));
    const byAgency = new Map<string, { agencyName: string; region: string | null; routes: Map<string, NightServiceRouteSummary> }>();
    for (const visible of visibleRoutes) {
      const properties = visible.properties;
      const routeKey = `${visible.agencySlug}::${properties.routeShortName ?? ''}::${properties.routeLongName ?? ''}`;
      const indexed = indexRoutes.get(routeKey);
      const entry = byAgency.get(visible.agencySlug) ?? {
        agencyName: properties.agencyName ?? indexed?.agencyName ?? visible.agencySlug,
        region: indexed?.region ?? null,
        routes: new Map(),
      };
      const summaryKey = `${properties.routeShortName ?? ''}::${properties.routeLongName ?? ''}`;
      const summary = entry.routes.get(summaryKey) ?? {
        routeShortName: properties.routeShortName ?? indexed?.routeShortName ?? null,
        routeLongName: properties.routeLongName ?? indexed?.routeLongName ?? null,
        destinations: [],
      };
      const headsign = properties.headsign ?? indexed?.headsign;
      if (headsign && !summary.destinations.includes(headsign)) summary.destinations.push(headsign);
      entry.routes.set(summaryKey, summary);
      byAgency.set(visible.agencySlug, entry);
    }
    const q = (filterQuery || query).trim().toLowerCase();
    const list = [...byAgency.entries()].map(([slug, entry]) => ({ slug, ...entry, routes: [...entry.routes.values()] }));
    if (!q) return list;
    return list
      .map(agency => ({
        ...agency,
        routes: agency.routes.filter(r =>
          agency.agencyName.toLowerCase().includes(q) ||
          (r.routeShortName ?? '').toLowerCase().includes(q) ||
          (r.routeLongName ?? '').toLowerCase().includes(q) ||
          r.destinations.some(destination => destination.toLowerCase().includes(q))
        ),
      }))
      .filter(agency => agency.agencyName.toLowerCase().includes(q) || agency.routes.length > 0);
  }, [data, query, visibleRoutes]);

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

        {data && !introDismissed && (
          <div className="relative px-4 pt-2.5 pb-3 border-b border-[var(--border-primary)]">
            <button
              onClick={dismissIntro}
              aria-label="Dismiss"
              className="absolute top-2 right-2 text-[var(--text-dim)] hover:text-[var(--text-primary)]"
            >
              <X className="w-3.5 h-3.5" />
            </button>
            <p className="pr-5 text-[11px] font-black text-[var(--text-primary)] leading-snug">
              Which routes actually run through the night?
            </p>
            <p className="mt-1 pr-5 text-[10px] text-[var(--text-dim)] font-bold leading-snug">
              A route counts here only if it has a departure at least every 60 minutes,
              2am to 6am, with no gap at either end of the core overnight window.
            </p>
            <p className="mt-1.5 text-[10px] font-bold" style={{ color: getNightServiceColor(colorMode) }}>
              {data.routeCount} qualifying route patterns across {data.agencyCount} agencies.
            </p>
          </div>
        )}
        {data && introDismissed && (
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
                <span className="font-normal text-[var(--text-dim)] ml-1">· {agency.routes.length} {agency.routes.length === 1 ? 'route' : 'routes'}</span>
              </div>
              {agency.routes.map(route => (
                <div key={`${route.routeShortName ?? ''}-${route.routeLongName ?? ''}`} className="px-4 py-2.5 border-b border-[var(--border-primary)] last:border-0">
                  <div className="text-xs font-black text-[var(--text-primary)] truncate">
                    {route.routeShortName || route.routeLongName || 'Unnamed route'}
                    {route.routeShortName && route.routeLongName && <span className="font-normal text-[var(--text-dim)]"> — {route.routeLongName}</span>}
                  </div>
                  {route.destinations.length > 0 && (
                    <div className="mt-0.5 text-[10px] font-bold text-[var(--text-dim)] truncate" title={route.destinations.join(' · ')}>
                      To {route.destinations.join(' · ')}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
  );
}
