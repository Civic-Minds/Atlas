import { MISSING_VALUE } from '../shared/missingValue';
import { countText } from '../shared/numberText';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useAgencies } from './hooks/useAgencies';
import type { ShapeProperties } from './hooks/useAgencyData';
import { isRiderMeaningfulGap } from './utils/routeCardUneven';
import { PERIOD_LABELS, TIME_PERIODS, type PeriodKey } from '../shared/config';
import { agencyNames } from './utils/agencyName';
import { DAY_TYPES, getNowDay, type DayType } from '../shared/dayTypes';
import Pill from './components/ui/Pill';
import DataTable, { type DataTableColumn, type DataTableSort } from './components/ui/DataTable';
import DocsPageLayout from './components/ui/DocsPageLayout';
import PageSection, { PageTable, PAGE_SECTION_NOTE, PAGE_LEAD } from './components/ui/PageSection';
import { PageTitle } from './components/ui/PageTitle';
import PageLoadState from './components/ui/PageLoadState';
import { DIAGNOSTICS_UNEVEN_PATH, INTERNAL_GROUPS } from '../shared/internalPages';
import type { Agency } from './App';
import { delayAmount, headwayAbout } from './utils/headwayText';

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
        headsign: p.headsign ?? MISSING_VALUE,
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

  // The shared table's sort: a header click sorts that column, most first; a second click turns it round (as before).
  const sort: DataTableSort = { key: sortKey, reversed: sortDir === 'asc' };
  function toggleSort(key: string) {
    const k = key as SortKey;
    if (k === sortKey) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(k); setSortDir('desc'); }
  }

  const tableColumns: DataTableColumn<(typeof sorted)[number]>[] = [
    { key: 'agency', header: 'Agency', sortable: true, rowHeader: true, width: 16, className: 'font-normal', cell: row => agencyNames(row.agencyName).name },
    { key: 'route', header: 'Route', sortable: true, align: 'left', cell: row => row.route },
    { key: 'period', header: 'Period', sortable: true, align: 'left', className: 'whitespace-nowrap', cell: row => PERIOD_LABELS[row.period as PeriodKey] ?? row.period },
    { key: 'headsign', header: 'Headsign', align: 'left', grow: true, cell: row => row.headsign },
    { key: 'excess', header: 'Gap vs. normal', sortable: true, className: 'whitespace-nowrap', cell: row => <>{delayAmount(row.maxGap)} <span className="text-[var(--text-dim)]">({headwayAbout(row.headway)})</span></> },
  ];
  const page = INTERNAL_GROUPS.flatMap(g => g.pages).find(x => x.path === DIAGNOSTICS_UNEVEN_PATH)!;
  useEffect(() => { document.title = `${page.title} | Atlas`; }, [page.title]);

  return (
    <DocsPageLayout width="wide">
      <PageTitle>{page.title}</PageTitle>
      <p className={PAGE_LEAD}>{page.description}</p>
      {agenciesLoadState === 'loading' || agenciesLoadState === 'error' || isLoading ? (
        <PageLoadState state={agenciesLoadState === 'error' && !isLoading ? 'error' : 'loading'} what="the agencies" onRetry={retry} />
      ) : (
        <PageSection id="uneven-flagged" title="Flagged Directions" intro={`${countText(sorted.length)} on a ${day.toLowerCase()}.`}>
          <div className="mt-4 flex gap-1.5">
            {DAY_TYPES.map(d => (
              <Pill key={d} onClick={() => setDay(d)} size="segment" selected={day === d}>{d}</Pill>
            ))}
          </div>
          {sorted.length === 0 ? (
            <p className={`mt-6 ${PAGE_SECTION_NOTE}`}>Nothing flagged — no direction has a gap materially bigger than its own normal spacing.</p>
          ) : (
            <PageTable>
              <DataTable variant="ruled" layout="page" caption={page.title} columns={tableColumns} rows={sorted} rowKey={row => row.key} sort={sort} onSort={toggleSort} />
            </PageTable>
          )}
        </PageSection>
      )}
    </DocsPageLayout>
  );
}
