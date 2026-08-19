import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Map as MapIcon, ArrowUpDown } from 'lucide-react';
import { useAgencies } from './hooks/useAgencies';
import type { ShapeProperties } from './hooks/useAgencyData';
import { isRiderMeaningfulGap } from './utils/routeCardUneven';
import { TIME_PERIODS, type PeriodKey } from '../shared/config';
import { DAY_TYPES, getNowDay, type DayType } from '../shared/dayTypes';
import { FLOATING_CARD } from './styles';
import type { Agency } from './App';

const MAX_CONCURRENT_FETCHES = 8;

interface Row {
  key: string;
  agencySlug: string;
  agencyName: string;
  route: string;
  headsign: string;
  day: string;
  period: string;
  headway: number;
  maxGap: number;
}

type SortKey = 'agency' | 'route' | 'period' | 'excess';
type SortDir = 'asc' | 'desc';

/** Pull only the flagged-row summary out of one agency's GeoJSON, discarding everything else
 *  (geometry, stop data, unflagged directions) before it ever reaches React state. */
function extractRows(slug: string, agencyName: string, fc: GeoJSON.FeatureCollection): Row[] {
  // Multiple shape variants (mid-route detours, etc.) can share the same route/direction/headsign
  // and would otherwise each contribute their own row -- keep only the worst gap per period for
  // a given route+direction+headsign+day, same dedup key Diagnostics.tsx uses for its table.
  const best = new Map<string, Row>();
  for (const f of fc.features) {
    const p = f.properties as (ShapeProperties & { day?: string });
    if (!p.routeId) continue;
    const day = p.day ?? 'Weekday';
    for (const { key: period } of TIME_PERIODS) {
      const headway = p.headwayByPeriod?.[period as PeriodKey] ?? p.headway;
      const maxGap = p.maxGapByPeriod?.[period as PeriodKey];
      if (maxGap == null || !isRiderMeaningfulGap(maxGap, headway)) continue;
      const key = `${p.routeId}-${p.directionId}-${(p.headsign ?? '').trim().toLowerCase()}-${day}-${period}`;
      const existing = best.get(key);
      if (existing && existing.maxGap >= maxGap) continue;
      best.set(key, {
        key: `${slug}-${key}`,
        agencySlug: slug,
        agencyName,
        route: p.routeShortName || String(p.routeId),
        headsign: p.headsign ?? '—',
        day,
        period,
        headway: headway ?? 0,
        maxGap,
      });
    }
  }
  return [...best.values()];
}

/**
 * Fetch every agency's GeoJSON once, in full, ignoring viewport, extract its flagged rows, then
 * drop the GeoJSON immediately -- keeping all 670 agencies' full geometry in React state just to
 * read a few small numbers off each route was the main memory cost of this page.
 *
 * useAgencyData (the map's loader) resets and cancels in-flight requests whenever its `agencies`
 * argument reference changes, which is right for a live viewport but fights a one-shot
 * "load everything" page: in dev, React StrictMode's double-invoke of the agencies-list effect
 * made that reset fire mid-load, silently dropping most of the 670 agencies even though the
 * loaded counter reported them all done -- hence the plain fetch loop below instead.
 */
function useUnevenRows(agencies: Agency[]) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loadedCount, setLoadedCount] = useState(0);
  const cancelled = useRef(false);

  useEffect(() => {
    if (agencies.length === 0) return;
    cancelled.current = false;
    setRows([]);
    setLoadedCount(0);
    const queue = [...agencies];

    async function worker() {
      while (queue.length > 0 && !cancelled.current) {
        const agency = queue.shift();
        if (!agency) break;
        try {
          const res = await fetch(agency.url);
          if (res.ok) {
            const data = await res.json() as GeoJSON.FeatureCollection;
            const extracted = extractRows(agency.slug, agency.name, data);
            if (!cancelled.current && extracted.length > 0) setRows(prev => [...prev, ...extracted]);
          }
        } catch {
          // Skip agencies that fail to load -- this is a maintainer tool, not the live map.
        }
        if (!cancelled.current) setLoadedCount(n => n + 1);
      }
    }

    const workers = Array.from({ length: MAX_CONCURRENT_FETCHES }, () => worker());
    Promise.all(workers).catch(() => {});
    return () => { cancelled.current = true; };
  }, [agencies]);

  return { rows, isLoading: agencies.length > 0 && loadedCount < agencies.length };
}

/**
 * Maintainer-only list of every direction with a materially uneven gap (isRiderMeaningfulGap,
 * #345) -- a way to eyeball where the route-card banner would fire before it's ever shown to a
 * rider, without the complexity of drawing it on the map (routes render from a pre-built PMTiles
 * archive, not from this page's filtered data, so a map view can't reflect this filter directly).
 */
export default function DiagnosticsUnevenPage() {
  const { agencies, agenciesLoadState, retry } = useAgencies();
  const { rows: allRows, isLoading } = useUnevenRows(agencies);
  const [day, setDay] = useState<DayType>(getNowDay());
  const [sortKey, setSortKey] = useState<SortKey>('excess');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const rows = useMemo(() => allRows.filter(r => r.day === day), [allRows, day]);

  const sorted = useMemo(() => {
    const withExcess = rows.map(r => ({ ...r, excess: r.maxGap - r.headway }));
    const dir = sortDir === 'asc' ? 1 : -1;
    return withExcess.sort((a, b) => {
      switch (sortKey) {
        case 'agency': return dir * a.agencyName.localeCompare(b.agencyName);
        case 'route': return dir * a.route.localeCompare(b.route, undefined, { numeric: true });
        case 'period': return dir * a.period.localeCompare(b.period);
        case 'excess': return dir * (a.excess - b.excess);
        default: return 0;
      }
    });
  }, [rows, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  const columns: { key: SortKey; label: string }[] = [
    { key: 'agency', label: 'Agency' },
    { key: 'route', label: 'Route' },
    { key: 'period', label: 'Period' },
    { key: 'excess', label: 'Gap vs. normal' },
  ];

  return (
    <div className="min-h-screen w-full bg-[var(--bg-app)] text-[var(--text-primary)] font-sans">
      <div className="sticky top-0 z-10 bg-[var(--bg-app)]/95 backdrop-blur-md border-b border-[var(--border-primary)] px-6 py-4 flex items-center gap-2">
        <a href="/" aria-label="Back to the frequency map" className="flex items-center gap-2">
          <div className="w-8 h-8 bg-[var(--accent)] rounded-full flex items-center justify-center shrink-0 shadow-2xl hover:opacity-80 transition-opacity">
            <MapIcon className="w-3.5 h-3.5 text-white" />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-xs sm:text-sm font-black text-[var(--text-primary)]">Atlas</span>
            <span className="text-[8px] sm:text-[10px] text-[var(--text-dim)]">by Civic Minds</span>
          </div>
        </a>
        <span className="w-px h-4 bg-[var(--border-primary)] shrink-0 ml-1" aria-hidden="true" />
        <span className="text-xl sm:text-2xl font-black text-[var(--text-primary)] leading-none">Uneven Headway</span>
        {!isLoading && (
          <div className="ml-auto flex items-center gap-3">
            <div className="flex gap-1.5">
              {DAY_TYPES.map(d => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDay(d)}
                  className={`h-7 px-2.5 flex items-center justify-center text-[10px] font-bold rounded-full border transition-colors ${
                    day === d
                      ? 'bg-[var(--accent-bg)] border-[var(--accent-border)] text-[var(--accent)]'
                      : 'border-[var(--border-primary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
            <span className="text-sm text-[var(--text-dim)]">{sorted.length} flagged</span>
          </div>
        )}
      </div>

      <div className="p-6">
        {agenciesLoadState === 'loading' || isLoading ? (
          <div className="flex items-center justify-center py-24 text-[var(--text-dim)] text-sm">Loading…</div>
        ) : agenciesLoadState === 'error' ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3 text-sm text-[var(--text-dim)]">
            <p>Could not load agency data.</p>
            <button
              type="button"
              className="px-3 py-1.5 rounded-full bg-[var(--bg-btn-hover)] text-[var(--text-primary)]"
              onClick={retry}
            >
              Retry
            </button>
          </div>
        ) : sorted.length === 0 ? (
          <div className="flex items-center justify-center py-24 text-[var(--text-dim)] text-sm">
            Nothing flagged — no direction has a gap materially bigger than its own normal spacing.
          </div>
        ) : (
          <div className={`${FLOATING_CARD} overflow-hidden`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border-primary)] text-left text-[var(--text-dim)]">
                    {columns.map(col => (
                      <th key={col.key} className="px-4 py-3 font-medium whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => toggleSort(col.key)}
                          className="flex items-center gap-1 hover:text-[var(--text-primary)] transition-colors"
                        >
                          {col.label}
                          <ArrowUpDown className={`w-3 h-3 ${sortKey === col.key ? 'opacity-100' : 'opacity-30'}`} />
                        </button>
                      </th>
                    ))}
                    <th className="px-4 py-3 font-medium whitespace-nowrap">Headsign</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map(row => (
                    <tr key={row.key} className="border-b border-[var(--border-primary)] last:border-0 hover:bg-[var(--bg-btn-hover)]/40 transition-colors">
                      <td className="px-4 py-2.5 whitespace-nowrap">{row.agencyName}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap font-medium">{row.route}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-[var(--text-dim)]">{row.period}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        {row.maxGap} min <span className="text-[var(--text-dim)]">(usually {row.headway} min)</span>
                      </td>
                      <td className="px-4 py-2.5 text-[var(--text-dim)]">{row.headsign}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
