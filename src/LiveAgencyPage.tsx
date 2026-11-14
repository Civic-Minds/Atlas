import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { useLiveAgencyNames } from './hooks/useLiveAgencyName';
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
import { DELAY_STARTS_TITLE, TYPICAL_ADDED, coveredRoutesText, lateStopsIntro, bunchPartsText, liveSubtitle, risePointsText, runTimeDiffText, runTimeShareText } from '../shared/liveWording';
import { pct as pctOf, pctTenth } from '../shared/liveFormat';
import { mins } from './components/Live/sections/figures';
import MethodSection from './components/Live/sections/MethodSection';
import LateStopsMap from './components/Live/LateStopsMapLazy';
import LegendItem from './components/ui/LegendItem';
import { lateShareColor } from './components/Live/lateShare';
import { LATE_MAP_HINT, LATE_MAP_STOPS, lateStopSpots } from './components/Live/lateStopsMapModel';
import { LIVE_API_NO_ANSWER, LIVE_NO_STOP_TO_RANK_YET, LIVE_NO_STRETCH_STANDS_OUT, LIVE_WEEK_NOT_IN_FILES, liveNoAgencyAnalysis, loadingText } from './content/noticeCopy';

/**
 * One column grid for every table on the page (widths in rem), in the area page's table layout: the figure columns sit
 * right-aligned at the right edge, each this wide, Route and Direction line up from table to table, and the first column
 * takes the rest (FIRST_COL is the least it gets before the table scrolls).
 */
const FIRST_COL = 15, ROUTE_COL = 10, DIR_COL = 6.5, FIGURE_COL = PAGE_FIGURE_COLUMN_REM;

const pct = (x: number | null) => (x == null ? '–' : pctOf(x));

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
              { key: 'route', header: 'Route', rowHeader: true, width: FIRST_COL, className: 'font-normal whitespace-nowrap', cell: r => <a href={liveDashboardPath(s.agency, r.route)} className="hover:underline"><RouteNameCell shortName={r.route} longName={r.longName} mode={r.mode} agencyName={s.agency} /></a> },
              { key: 'late', sortable: true, header: 'Late', width: FIGURE_COL, cell: r => <span title={`${r.lateN.toLocaleString()} trips this week`}>{pct(r.lateShare)}</span> },
              { key: 'lastWeek', header: 'Last week', width: FIGURE_COL, narrowHide: true, className: 'text-[var(--text-muted)]', cell: r => pct(r.lateLastWeek) },
              { key: 'runTime', sortable: true, header: 'Run time', width: FIGURE_COL, className: 'whitespace-nowrap', cell: r => (r.runTimeDiffMin != null ? runTimeDiffText(r.runTimeDiffMin, false) : r.runTimeOver == null ? '–' : runTimeShareText(r.runTimeOver)) },
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
 * The stops most often late, on a map (CIV-1405): `rows` is the summary's list, worst first. Each stop's card names the
 * route, direction and late share of every listed row at that stop.
 */
function LateStops({ s, rows }: { s: AgencySummary; rows: AgencyHotspotStop[] }) {
  if (!rows.length) return <p className="mt-3 text-sm text-[var(--text-muted)]">{LIVE_NO_STOP_TO_RANK_YET}</p>;
  const spots = lateStopSpots(rows.map(r => ({ key: `${r.route}-${r.directionId}-${r.stopId}`, lonLat: r.lat != null && r.lon != null ? [r.lon, r.lat] : null, name: stop(r.name), line: `${r.route} ${nameCase(r.direction, 'liveStop')}: ${pct(r.lateShare)} late`, lateShare: r.lateShare })));
  return <LateStopsMap spots={spots} routes={{ agency: s.agency }} label={`Map of the ${rows.length} stops most often late`} className="mt-6" />;
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
  const { name: agencyName, title: agencyTitle } = useLiveAgencyNames(agency);
  // Live off: no request at all, only the notice.
  const state = useLiveAgency(FEATURES.liveReports ? agency : '');
  useEffect(() => {
    if (!agency) return;
    applySeoToDocument(document, { title: liveReportTitle(agencyName), description: '', canonicalUrl: `${ATLAS_MODE === 'public' ? SITE_URL : window.location.origin}${window.location.pathname}`, noindex: true, matchedPath: window.location.pathname });
  }, [agency, agencyName]);
  if (!FEATURES.liveReports) return <LiveOffNotice />;
  // The page title is the agency's full name, as on the map's agency page; the short name stays in the subtitle and tab title (CIV-1448).
  const name = agencyTitle;
  const back = FEATURES.live ? <ArrowLink href="/apps/live">Open Live</ArrowLink> : null;
  if (state.kind === 'loading') return <DocsPageLayout width="wide"><p className="mt-24 text-sm text-[var(--text-muted)]" aria-busy="true">{loadingText(agencyName)}</p></DocsPageLayout>;
  if (state.kind === 'error' || state.data.status !== 'ready') {
    const reason = state.kind === 'error' ? state.reason : state.data.status === 'no_analysis' ? devOnly(state.data.reason) : (state.data as { reason: string }).reason;
    return <EmptyPage title={name} body={reason} action={back} />;
  }
  const s = state.data.summary;
  const coverage = coveredRoutesText(agencyName, s.routes);
  const w = s.weekly;
  const dates = w?.thisWeek.dates ?? [];
  const tiles = agencyKpiTiles(s);
  return (
    <DocsPageLayout width="wide">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <PageTitle>{name}</PageTitle>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              {liveSubtitle({ thisWeek: dates, lastWeek: w?.comparable ? w.lastWeek.dates : null, middle: coverage, agency: agencyName })}
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

        <Section id="agency-stops" title="Stops most often late" intro={`${lateStopsIntro(Math.min(s.worstStops.length, LATE_MAP_STOPS), { scope: 'agency', dates })} ${LATE_MAP_HINT}`}>
          <LateStops s={s} rows={s.worstStops.slice(0, LATE_MAP_STOPS)} />
        </Section>

        <Section id="agency-delay" title={DELAY_STARTS_TITLE} intro="Route directions where delay jumps on one stretch and stays up, and the typical minutes it adds there.">
          <StretchTable s={s} rows={s.delayStarts} caption="Stretches that add the most delay" valueHeader={TYPICAL_ADDED} format={mins} />
        </Section>

        <Section id="agency-bunching" title="Where bunching forms" intro="Route directions where the share of gaps that are too short or too long steps up on one stretch and stays up.">
          <StretchTable s={s} rows={s.bunchingForms} caption="Stretches where bunching rises the most" valueHeader="Added" format={risePointsText} />
        </Section>

        <MethodSection scope="agency" s={s} agencyName={agencyName} />
    </DocsPageLayout>
  );
}
