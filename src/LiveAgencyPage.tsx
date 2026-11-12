import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { useLiveAgencyName } from './hooks/useLiveAgencyName';
import { ATLAS_MODE, FEATURES } from '../shared/config';
import { type AgencyHotspotStop, type AgencyHotspotStretch, type AgencyRouteRow, type AgencySummary } from '../shared/liveAgency';
import type { LiveAgencyResponse } from '../local-api/live-agency';
import { devOnly, liveAgencyDataUrl, liveDataMissing, liveReportTitle } from './lib/liveReportData';
import { applySeoToDocument } from './lib/seoDom';
import { SITE_URL } from '../shared/seo';
import { liveDashboardPath, liveToolPath } from './hooks/useLiveDashboard';
import { routesByMode } from '../shared/agencyPages';
import { RouteNameCell } from './pageParts';
import { agencyKpiTiles } from './utils/liveAgencyKpi';
import { weekNotComparableLine } from './utils/liveKpi';
import { syncUrlParams } from './utils/syncUrlParams';
import { LIVE_AGENCY_URL, currentSearch, linkUpdate, readUrlParam, type LiveSort } from './utils/urlSchema';
import { nameCase } from './utils/format';
import { liveStopName as stop, stretchLabel } from './utils/stopLabel';
import ErrorBoundary from './components/ErrorBoundary';
import DocsPageLayout from './components/ui/DocsPageLayout';
import PageSection, { PageTable } from './components/ui/PageSection';
import ScrollX from './components/ui/ScrollX';
import EmptyPage from './components/ui/EmptyPage';
import DataTable, { PAGE_FIGURE_COLUMN_REM } from './components/ui/DataTable';
import SortableDataTable from './components/ui/SortableDataTable';
import LiveOffNotice from './components/LiveOffNotice';
import { KpiTiles } from './LiveDashboardView';
import ArrowLink from './components/ui/ArrowLink';
import { PageTitle } from './components/ui/PageTitle';
import DevHint from './components/Live/DevHint';
import { ANALYZE_DEV_HINT } from './lib/liveReportData';
import { coveredRoutesText, lateStopsIntro, bunchPartsText, liveSubtitle, risePointsText, runTimeDiffText } from '../shared/liveWording';
import { pct as pctOf, pctTenth, signedPct } from '../shared/liveFormat';
import { mins } from './components/Live/sections/figures';
import MethodSection from './components/Live/sections/MethodSection';
import LateStopsMap from './components/Live/LateStopsMapLazy';
import LegendItem from './components/ui/LegendItem';
import { lateShareColor } from './components/Live/lateShare';
import { lateStopDots } from './components/Live/lateStopsMapModel';
import { LATE_MAP_STOPS, lateMapNote, lateTableRows } from './components/Live/lateStopsMock';
import { LIVE_API_NO_ANSWER, LIVE_NO_STOP_TO_RANK_YET, LIVE_NO_STRETCH_STANDS_OUT, LIVE_WEEK_NOT_IN_FILES, liveNoAgencyAnalysis, loadingText } from './content/noticeCopy';

/**
 * One column grid for every table on the page (widths in rem), in the area page's table layout: the figure columns sit
 * right-aligned at the right edge, each this wide, Route and Direction line up from table to table, and the first column
 * takes the rest (FIRST_COL is the least it gets before the table scrolls).
 */
const FIRST_COL = 15, ROUTE_COL = 10, DIR_COL = 6.5, FIGURE_COL = PAGE_FIGURE_COLUMN_REM;

const pct = (x: number | null) => (x == null ? '–' : pctOf(x));
const pctSigned = (x: number | null) => (x == null ? '–' : signedPct(x));

type Sort = LiveSort;
const SORTS: [Sort, string][] = [['late', 'Late'], ['runTime', 'Run time'], ['bunching', 'Bunching'], ['delivered', 'Service delivered']];
/** The value a route is sorted by, highest first. A switch, not an object lookup, so no outside value picks a method. */
function sortValue(sort: Sort, r: AgencyRouteRow): number {
  switch (sort) {
    case 'runTime': return r.runTimeOver ?? -Infinity;
    case 'bunching': return r.bunchingShare ?? -1;
    // Fewest trips delivered first.
    case 'delivered': return -(r.deliveredShare ?? 2);
    default: return r.lateShare ?? -1;
  }
}

/** Fetches nothing while `agency` is empty (Live switched off). */
export function useLiveAgency(agency: string): { kind: 'loading' } | { kind: 'error'; reason: string } | { kind: 'done'; data: LiveAgencyResponse } {
  const [state, setState] = useState<{ kind: 'loading' } | { kind: 'error'; reason: string } | { kind: 'done'; data: LiveAgencyResponse }>({ kind: 'loading' });
  useEffect(() => {
    if (!agency) return;
    let live = true;
    fetch(liveAgencyDataUrl(agency))
      .then(r => (liveDataMissing(r) ? { status: 'unknown_agency', reason: liveNoAgencyAnalysis(agency) } as LiveAgencyResponse : r.json() as Promise<LiveAgencyResponse>))
      .then(data => { if (live) setState({ kind: 'done', data }); })
      .catch(() => { if (live) setState({ kind: 'error', reason: devOnly(LIVE_API_NO_ANSWER) }); });
    return () => { live = false; };
  }, [agency]);
  return state;
}

function Section({ id, title, intro, children }: { id: string; title: string; intro?: string; children: React.ReactNode }) {
  return (
    <PageSection id={id} title={title} intro={intro}>
      <ErrorBoundary>{children}</ErrorBoundary>
    </PageSection>
  );
}

/** A hotspot's route, in the Routes table's name style, on one line (its direction sits in its own column). */
function HotspotRoute({ s, route }: { s: AgencySummary; route: string }) {
  const r = s.routes.find(x => x.route === route);
  return <a href={liveDashboardPath(s.agency, route)} className="whitespace-nowrap hover:underline"><RouteNameCell shortName={route} longName={r?.longName} mode={r?.mode ?? 3} agencyName={s.agency} /></a>;
}

function RoutesTable({ s }: { s: AgencySummary }) {
  const [sort, setSort] = useState<Sort>(() => readUrlParam(currentSearch(), LIVE_AGENCY_URL.sort) ?? 'late');
  const [reversed, setReversed] = useState(false);
  useEffect(() => { syncUrlParams(linkUpdate(LIVE_AGENCY_URL, { sort })); }, [sort]);
  // A header click sorts worst first; clicking the sorted header again turns the order round.
  const onSort = (key: string) => {
    const next = SORTS.find(([k]) => k === key)?.[0];
    if (!next) return;
    if (next === sort) setReversed(r => !r); else { setSort(next); setReversed(false); }
  };
  const rows = [...s.routes].sort((a, b) => (reversed ? -1 : 1) * (sortValue(sort, b) - sortValue(sort, a)) || a.route.localeCompare(b.route, undefined, { numeric: true }));
  return (
    <>
      {routesByMode(rows.map(r => ({ ...r, mode: r.mode ?? 3 }))).map(group => (
        <div key={group.mode} className="mt-4">
          <h3 className="pb-2 text-base font-black" aria-hidden="true">{group.label} <span className="ml-1 font-normal text-[var(--text-muted)]">{group.routes.length}</span></h3>
          {/* The agency page's routes table (ScrollX + the page layout), with each row opening its route's report. */}
          <ScrollX className="-mx-2">
          <DataTable
            caption={`${group.label} ${group.routes.length}`}
            layout="page"
            // On a phone the table fits the screen, leaving out last week's Late, as Live's other tables do (#1151).
            narrowFit
            rowHref={r => liveDashboardPath(s.agency, r.route)}
            sort={{ key: sort, reversed }}
            onSort={onSort}
            rows={group.routes}
            rowKey={r => r.route}
            columns={[
              { key: 'route', header: 'Route', rowHeader: true, width: FIRST_COL, className: 'font-normal', cell: r => <a href={liveDashboardPath(s.agency, r.route)} className="hover:underline"><RouteNameCell shortName={r.route} longName={r.longName} mode={r.mode} agencyName={s.agency} /></a> },
              { key: 'late', sortable: true, header: 'Late', width: FIGURE_COL, cell: r => <span title={`${r.lateN.toLocaleString()} trips this week`}>{pct(r.lateShare)}</span> },
              { key: 'lastWeek', header: 'Last week', width: FIGURE_COL, narrowHide: true, className: 'text-[var(--text-muted)]', cell: r => pct(r.lateLastWeek) },
              { key: 'runTime', sortable: true, header: 'Run time', width: FIGURE_COL, cell: r => (r.runTimeDiffMin != null ? runTimeDiffText(r.runTimeDiffMin, false) : pctSigned(r.runTimeOver)) },
              { key: 'bunching', sortable: true, header: 'Bunching', width: FIGURE_COL, cell: r => (r.bunchingShare != null && r.bunchedShare != null && r.gappedShare != null ? bunchPartsText(r.bunchingShare, r.bunchedShare, r.gappedShare) : pct(r.bunchingShare)) },
              { key: 'delivered', sortable: true, header: 'Delivered', width: FIGURE_COL, cell: r => (r.deliveredShare == null ? '–' : pctTenth(r.deliveredShare)) },
            ]}
          />
          </ScrollX>
        </div>
      ))}
    </>
  );
}

/**
 * CIV-1405 mock-up: the stops most often late as a map and, under it, a table of the same list. `mapRows` is the
 * summary's list, worst first; the table shows its first `tableCount` rows. Each stop's rank in that list is the number
 * on its dot and in front of its name, whatever the table is sorted by.
 */
function StopsTable({ s, mapRows, tableCount }: { s: AgencySummary; mapRows: AgencyHotspotStop[]; tableCount: number }) {
  if (!mapRows.length) return <p className="mt-3 text-sm text-[var(--text-muted)]">{LIVE_NO_STOP_TO_RANK_YET}</p>;
  const keyOf = (r: AgencyHotspotStop) => `${r.route}-${r.directionId}-${r.stopId}`;
  const rank = new Map(mapRows.map((r, i) => [keyOf(r), i + 1]));
  const rows = mapRows.slice(0, tableCount);
  const dots = lateStopDots(mapRows, r => ({ key: keyOf(r), lonLat: r.lat != null && r.lon != null ? [r.lon, r.lat] : null, lateShare: r.lateShare, title: `${stop(r.name)} (${r.route} ${nameCase(r.direction, 'liveStop')}): ${pct(r.lateShare)} late` }));
  return (
    <>
      <LateStopsMap dots={dots} label={`Map of the ${dots.length} stops most often late; the table lists the same stops with their figures`} note={lateMapNote(rows.length, dots.length)} mapClassName="h-72 lg:h-96" className="mt-6" />
      <PageTable>
      <SortableDataTable
        narrowFit
        caption="Stops most often late, all analysed routes"
        rows={rows}
        defaultSort="late"
        rowKey={r => `${r.route}-${r.directionId}-${r.stopId}`}
        columns={[
          { key: 'stop', header: 'Stop', rowHeader: true, width: FIRST_COL, className: 'font-normal break-words', cell: r => <span title={stop(r.name)} className="flex gap-2"><span className="w-5 shrink-0 whitespace-nowrap text-right font-bold tabular-nums text-[var(--text-muted)]">{rank.get(keyOf(r))}</span><span>{stop(r.name)}</span></span> },
          { key: 'route', header: 'Route', width: ROUTE_COL, align: 'left', className: 'truncate', cell: r => <HotspotRoute s={s} route={r.route} /> },
          { key: 'dir', header: 'Direction', width: DIR_COL, align: 'left', narrowHide: true, cell: r => nameCase(r.direction, 'liveStop') },
          { key: 'late', header: 'Late', width: FIGURE_COL, worst: r => r.lateShare, cell: r => <LegendItem color={lateShareColor(r.lateShare)} className="gap-2">{pct(r.lateShare)}</LegendItem> },
          { key: 'typical', header: 'Typical', width: FIGURE_COL, worst: r => r.medianMin, cell: r => mins(r.medianMin) },
          { key: 'n', header: 'Departures', width: FIGURE_COL, narrowHide: true, cell: r => r.n.toLocaleString() },
        ]}
      />
      </PageTable>
    </>
  );
}

/** Without `valueHeader` the table has no value column and keeps the summary's order (largest first). */
function StretchTable({ s, rows, caption, valueHeader, format }: { s: AgencySummary; rows: AgencyHotspotStretch[]; caption: string; valueHeader?: string; format?: (v: number) => string }) {
  if (!rows.length) return <p className="mt-3 text-sm text-[var(--text-muted)]">{LIVE_NO_STRETCH_STANDS_OUT}</p>;
  return (
    <PageTable>
      <SortableDataTable
        narrowFit={!!valueHeader}
        caption={caption}
        // With no number column the table keeps the shared widths and ends short of the edge.
        layout={valueHeader ? 'page' : 'fixed'}
        rows={rows}
        defaultSort={valueHeader ? 'value' : undefined}
        rowKey={r => `${r.route}-${r.directionId}-${r.fromStopId}-${r.toStopId}`}
        columns={[
          { key: 'stretch', header: 'Stretch', rowHeader: true, width: FIRST_COL, className: 'font-normal break-words', cell: r => { const name = stretchLabel(nameCase(r.fromName, 'liveStop'), nameCase(r.toName, 'liveStop')); return <span title={name}>{name}</span>; } },
          { key: 'route', header: 'Route', width: ROUTE_COL, align: 'left' as const, className: 'truncate', cell: r => <HotspotRoute s={s} route={r.route} /> },
          { key: 'dir', header: 'Direction', width: DIR_COL, align: 'left' as const, narrowHide: !!valueHeader, cell: r => nameCase(r.direction, 'liveStop') },
          ...(valueHeader && format ? [{ key: 'value', header: valueHeader, width: FIGURE_COL, worst: (r: AgencyHotspotStretch) => r.value, cell: (r: AgencyHotspotStretch) => <span className="whitespace-nowrap">{format(r.value)}</span> }] : []),
        ]}
      />
    </PageTable>
  );
}

export default function LiveAgencyPage() {
  const { agency = '' } = useParams();
  const agencyName = useLiveAgencyName(agency);
  // Live off: no request at all, only the notice.
  const state = useLiveAgency(FEATURES.liveReports ? agency : '');
  useEffect(() => {
    if (!agency) return;
    applySeoToDocument(document, { title: liveReportTitle(agencyName), description: '', canonicalUrl: `${ATLAS_MODE === 'public' ? SITE_URL : window.location.origin}${window.location.pathname}`, noindex: true, matchedPath: window.location.pathname });
  }, [agency, agencyName]);
  if (!FEATURES.liveReports) return <LiveOffNotice />;
  const name = agencyName;
  const back = FEATURES.live ? <ArrowLink href="/apps/live">Open Live</ArrowLink> : null;
  if (state.kind === 'loading') return <DocsPageLayout width="wide"><p className="mt-24 text-sm text-[var(--text-muted)]" aria-busy="true">{loadingText(name)}</p></DocsPageLayout>;
  if (state.kind === 'error' || state.data.status !== 'ready') {
    const reason = state.kind === 'error' ? state.reason : state.data.status === 'no_analysis' ? devOnly(state.data.reason) : (state.data as { reason: string }).reason;
    return <EmptyPage title={name} body={reason} action={back} />;
  }
  const s = state.data.summary;
  const coverage = coveredRoutesText(s.agency, s.routes);
  const w = s.weekly;
  const dates = w?.thisWeek.dates ?? [];
  const tiles = agencyKpiTiles(s);
  return (
    <DocsPageLayout width="wide">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <PageTitle>{name}</PageTitle>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              {liveSubtitle({ thisWeek: dates, lastWeek: w?.comparable ? w.lastWeek.dates : null, middle: coverage, agency })}
            </p>
          </div>
          {FEATURES.liveReports && <ArrowLink href={liveToolPath(agency)} className="shrink-0 whitespace-nowrap">View on Live map</ArrowLink>}
        </div>
        <ErrorBoundary>
          {w && tiles.length
            ? <KpiTiles tiles={tiles} caption={weekNotComparableLine({ ...w, health: [] })} />
            : <><p className="mt-5 text-sm text-[var(--text-muted)]">{LIVE_WEEK_NOT_IN_FILES}</p><DevHint hint={ANALYZE_DEV_HINT} /></>}
        </ErrorBoundary>

        <Section id="agency-routes" title="Routes" intro="Every analysed route, worst first.">
          <RoutesTable s={s} />
        </Section>

        <Section id="agency-stops" title="Stops most often late" intro={lateStopsIntro(Math.min(s.worstStops.length, lateTableRows()), dates)}>
          <StopsTable s={s} mapRows={s.worstStops.slice(0, LATE_MAP_STOPS)} tableCount={lateTableRows()} />
        </Section>

        <Section id="agency-delay" title="Where delays start" intro="Route directions where delay jumps on one stretch and stays up, and the typical minutes it adds there.">
          <StretchTable s={s} rows={s.delayStarts} caption="Stretches that add the most delay" valueHeader="Added" format={mins} />
        </Section>

        <Section id="agency-bunching" title="Where bunching forms" intro="Route directions where the share of gaps that are too short or too long steps up on one stretch and stays up.">
          <StretchTable s={s} rows={s.bunchingForms} caption="Stretches where bunching rises the most" valueHeader="Added" format={risePointsText} />
        </Section>

        <MethodSection scope="agency" s={s} />
    </DocsPageLayout>
  );
}
