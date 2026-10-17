import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { ATLAS_MODE, FEATURES } from '../shared/config';
import { type AgencyHotspotStop, type AgencyHotspotStretch, type AgencyRouteRow, type AgencySummary } from '../shared/liveAgency';
import { dateRangeText } from '../shared/liveDashboard';
import type { LiveAgencyResponse } from '../local-api/live-agency';
import { devOnly, liveAgencyDataUrl, liveDataMissing, liveReportTitle, withoutDevHint } from './lib/liveReportData';
import { applySeoToDocument } from './lib/seoDom';
import { SITE_URL } from '../shared/seo';
import { liveDashboardPath } from './hooks/useLiveDashboard';
import { routesByMode } from '../shared/agencyPages';
import { RouteNameCell } from './pageParts';
import { agencyKpiTiles } from './utils/liveAgencyKpi';
import { weekNotComparableLine, weekWindowLine } from './utils/liveKpi';
import { syncUrlParams } from './utils/syncUrlParams';
import { titleCase } from './utils/format';
import { shortStopName } from './utils/stopLabel';
import ErrorBoundary from './components/ErrorBoundary';
import PageShell from './components/ui/PageShell';
import DataTable from './components/ui/DataTable';
import SortableDataTable from './components/ui/SortableDataTable';
import LiveOffNotice from './components/LiveOffNotice';
import { KpiTiles, YesterdayTiles } from './LiveDashboardView';
import ArrowLink from './components/ui/ArrowLink';
import { PageTitle, SectionTitle } from './components/ui/PageTitle';
import { builtText, coveredRoutesText, liveSubtitle, METHOD_GROUPS, dayComparedWith, dayText, estimatedNote, weekOfText } from '../shared/liveWording';
import { useLiveYesterday } from './hooks/useLiveYesterday';
import PeriodSubtitle from './components/Live/PeriodSubtitle';
import MethodFootnote, { Term } from './components/Live/MethodFootnote';
import { bunchingLine, colourLine, deliveredLine, extraWaitLine, lateAtStopLine, lateLine, positionsLine, recordingGapsLine, runTimeLine, tripMatchLine } from './components/Live/methodLines';

const MINUS = '−';
const pct = (x: number | null) => (x == null ? '–' : `${Math.round(x * 100)}%`);
const pctSigned = (x: number | null) => (x == null ? '–' : `${x > 0 ? '+' : x < 0 ? MINUS : ''}${Math.abs(Math.round(x * 100))}%`);
const num = (x: number) => (Math.round(x * 10) / 10).toString().replace('-', MINUS);
const mins = (x: number) => `${x > 0 ? '+' : ''}${num(x)} min`;
const stop = (name: string) => shortStopName(titleCase(name));

type Sort = 'late' | 'runTime' | 'bunching' | 'delivered';
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
function useLiveAgency(agency: string): { kind: 'loading' } | { kind: 'error'; reason: string } | { kind: 'done'; data: LiveAgencyResponse } {
  const [state, setState] = useState<{ kind: 'loading' } | { kind: 'error'; reason: string } | { kind: 'done'; data: LiveAgencyResponse }>({ kind: 'loading' });
  useEffect(() => {
    if (!agency) return;
    let live = true;
    fetch(liveAgencyDataUrl(agency))
      .then(r => (liveDataMissing(r) ? { status: 'unknown_agency', reason: `Live has no route analysis for ${agency}.` } as LiveAgencyResponse : r.json() as Promise<LiveAgencyResponse>))
      .then(data => { if (live) setState({ kind: 'done', data }); })
      .catch(() => { if (live) setState({ kind: 'error', reason: devOnly('The Live API did not answer. Start Live with "npm run live" and open this page on the address it prints.') }); });
    return () => { live = false; };
  }, [agency]);
  return state;
}

function Section({ id, title, intro, children }: { id: string; title: string; intro?: string; children: React.ReactNode }) {
  return (
    <section className="mt-12" aria-labelledby={id}>
      <SectionTitle id={id}>{title}</SectionTitle>
      {intro && <p className="mt-1 max-w-3xl text-sm text-[var(--text-muted)]">{intro}</p>}
      <ErrorBoundary>{children}</ErrorBoundary>
    </section>
  );
}

/** A hotspot's route, in the Routes table's name style, on one line (its direction sits in its own column). */
function HotspotRoute({ s, route }: { s: AgencySummary; route: string }) {
  const r = s.routes.find(x => x.route === route);
  return <a href={liveDashboardPath(s.agency, route)} className="whitespace-nowrap hover:underline"><RouteNameCell shortName={route} longName={r?.longName} mode={r?.mode ?? 3} agencyName={s.agency.toUpperCase()} /></a>;
}

function RoutesTable({ s }: { s: AgencySummary }) {
  const [sort, setSort] = useState<Sort>(() => {
    const v = new URLSearchParams(window.location.search).get('sort');
    return SORTS.some(([k]) => k === v) ? v as Sort : 'late';
  });
  const [reversed, setReversed] = useState(false);
  useEffect(() => { syncUrlParams({ sort: sort === 'late' ? null : sort }); }, [sort]);
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
        <div key={group.mode} className="mt-4 overflow-x-auto">
          <h3 className="pb-2 text-base font-black" aria-hidden="true">{group.label} <span className="ml-1 font-normal text-[var(--text-muted)]">{group.routes.length}</span></h3>
          <DataTable
            caption={`${group.label} ${group.routes.length}`}
            fixed
            fill
            sort={{ key: sort, reversed }}
            onSort={onSort}
            rows={group.routes}
            rowKey={r => r.route}
            columns={[
              { key: 'route', header: 'Route', rowHeader: true, className: 'font-normal', cell: r => <a href={liveDashboardPath(s.agency, r.route)} className="hover:underline"><RouteNameCell shortName={r.route} longName={r.longName} mode={r.mode} agencyName={s.agency.toUpperCase()} /></a> },
              { key: 'late', sortable: true, header: 'Late', cell: r => <span title={`${r.lateN.toLocaleString()} trips this week`}>{pct(r.lateShare)}</span> },
              { key: 'lastWeek', header: 'Last week', className: 'text-[var(--text-muted)]', cell: r => pct(r.lateLastWeek) },
              { key: 'runTime', sortable: true, header: 'Run time', cell: r => pctSigned(r.runTimeOver) },
              { key: 'bunching', sortable: true, header: 'Bunching', cell: r => pct(r.bunchingShare) },
              { key: 'delivered', sortable: true, header: 'Delivered', cell: r => (r.deliveredShare == null ? '–' : `${(Math.floor(r.deliveredShare * 1000) / 10).toString()}%`) },
            ]}
          />
        </div>
      ))}
    </>
  );
}

/** The network's worst stops shown (the summary may hold more; older files had 15). */
const TOP_STOPS = 10;

function StopsTable({ s, rows }: { s: AgencySummary; rows: AgencyHotspotStop[] }) {
  if (!rows.length) return <p className="mt-3 text-sm text-[var(--text-muted)]">No stop has enough departures to rank yet.</p>;
  return (
    <div className="relative mt-3 overflow-x-auto">
      <SortableDataTable
        caption="Stops where the most cars leave late, all analysed routes"
        rows={rows}
        defaultSort="late"
        rowKey={r => `${r.route}-${r.directionId}-${r.stopId}`}
        columns={[
          { key: 'stop', header: 'Stop', rowHeader: true, className: 'font-normal truncate', cell: r => <span title={stop(r.name)}>{stop(r.name)}</span> },
          { key: 'route', header: 'Route', cell: r => <HotspotRoute s={s} route={r.route} /> },
          { key: 'dir', header: 'Direction', cell: r => titleCase(r.direction) },
          { key: 'late', header: 'Late', worst: r => r.lateShare, cell: r => pct(r.lateShare) },
          { key: 'typical', header: 'Typical', worst: r => r.medianMin, cell: r => mins(r.medianMin) },
          { key: 'n', header: 'Departures', cell: r => r.n.toLocaleString() },
        ]}
      />
    </div>
  );
}

/** Without `valueHeader` the table has no value column and keeps the summary's order (largest first). */
function StretchTable({ s, rows, caption, valueHeader, format }: { s: AgencySummary; rows: AgencyHotspotStretch[]; caption: string; valueHeader?: string; format?: (v: number) => string }) {
  if (!rows.length) return <p className="mt-3 text-sm text-[var(--text-muted)]">No stretch stands out on the analysed routes.</p>;
  return (
    <div className="relative mt-3 overflow-x-auto">
      <SortableDataTable
        caption={caption}
        rows={rows}
        defaultSort={valueHeader ? 'value' : undefined}
        rowKey={r => `${r.route}-${r.directionId}-${r.fromStopId}-${r.toStopId}`}
        columns={[
          { key: 'stretch', header: 'Stretch', rowHeader: true, width: 24, className: 'font-normal truncate', cell: r => <span title={`${stop(r.fromName)} to ${stop(r.toName)}`}>{stop(r.fromName)} to {stop(r.toName)}</span> },
          { key: 'route', header: 'Route', cell: r => <HotspotRoute s={s} route={r.route} /> },
          { key: 'dir', header: 'Direction', cell: r => titleCase(r.direction) },
          ...(valueHeader && format ? [{ key: 'value', header: valueHeader, worst: (r: AgencyHotspotStretch) => r.value, cell: (r: AgencyHotspotStretch) => format(r.value) }] : []),
        ]}
      />
    </div>
  );
}

export default function LiveAgencyPage() {
  const { agency = '' } = useParams();
  // Live off: no request at all, only the notice.
  const state = useLiveAgency(FEATURES.liveReports ? agency : '');
  // This week / Yesterday (CIV-278), kept in the address; Yesterday swaps the tiles only.
  const [day, setDay] = useState<'week' | 'yesterday'>(() => (new URLSearchParams(window.location.search).get('day') === 'yesterday' ? 'yesterday' : 'week'));
  useEffect(() => { syncUrlParams({ day: day === 'yesterday' ? 'yesterday' : null }); }, [day]);
  const yesterday = useLiveYesterday(FEATURES.liveReports ? agency : null, null, day === 'yesterday');
  useEffect(() => {
    if (!agency) return;
    applySeoToDocument(document, { title: liveReportTitle(agency.toUpperCase()), description: '', canonicalUrl: `${ATLAS_MODE === 'public' ? SITE_URL : window.location.origin}${window.location.pathname}`, noindex: true, matchedPath: window.location.pathname });
  }, [agency]);
  if (!FEATURES.liveReports) return <LiveOffNotice />;
  const name = agency.toUpperCase();
  const back = FEATURES.live ? <ArrowLink href="/apps/live" className="mt-6">Open Live</ArrowLink> : null;
  if (state.kind === 'loading') return <PageShell variant="wide"><p className="mt-24 text-sm text-[var(--text-muted)]" aria-busy="true">Loading {name}…</p></PageShell>;
  if (state.kind === 'error' || state.data.status !== 'ready') {
    const reason = state.kind === 'error' ? state.reason : state.data.status === 'no_analysis' ? devOnly(state.data.reason) : (state.data as { reason: string }).reason;
    return <PageShell variant="wide"><PageTitle className="mt-24">{name}</PageTitle><p className="mt-4 max-w-2xl text-base leading-7 text-[var(--text-muted)]">{reason}</p>{back}</PageShell>;
  }
  const s = state.data.summary;
  const coverage = coveredRoutesText(s.agency, s.routes);
  const w = s.weekly;
  const dates = w?.thisWeek.dates ?? [];
  const tiles = agencyKpiTiles(s);
  const shown = day === 'yesterday' ? yesterday : null;
  return (
    <PageShell variant="wide">
      <article className="pb-16 pt-10 sm:pt-14">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <PageTitle>{name}</PageTitle>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              <PeriodSubtitle
                text={shown ? `${shown.weekly.comparable ? dayComparedWith(shown.date, shown.compareDate) : dayText(shown.date)} · ${coverage} · ${estimatedNote(agency)}` : liveSubtitle({ thisWeek: dates, lastWeek: w?.comparable ? w.lastWeek.dates : null, middle: coverage, agency })}
                dateLabel={shown ? dayText(shown.date) : dates.length ? weekOfText(dates[0], dates[dates.length - 1]) : ''}
                value={day}
                onChange={setDay}
              />
            </p>
          </div>
          {FEATURES.live && <ArrowLink href="/apps/live" className="shrink-0 whitespace-nowrap">View on Live map</ArrowLink>}
        </div>
        <ErrorBoundary>
          {shown ? <YesterdayTiles y={shown} tiles={agencyKpiTiles({ ...s, weekly: shown.weekly, daily: shown.daily })} /> : w && tiles.length
            ? <KpiTiles tiles={tiles} caption={weekNotComparableLine({ ...w, health: [] })} />
            : <p className="mt-5 text-sm text-[var(--text-muted)]">{withoutDevHint('This week against last week is not in the analysis files yet. Rebuild them with npm run live:analyze.')}</p>}
        </ErrorBoundary>

        <Section id="agency-routes" title="Routes" intro="Every analysed route, worst first.">
          <RoutesTable s={s} />
        </Section>

        <Section id="agency-stops" title="Stops where the most cars leave late" intro={`The ${Math.min(s.worstStops.length, TOP_STOPS)} stops with the highest share of departures 5.5+ minutes late, across all analysed routes.`}>
          <StopsTable s={s} rows={s.worstStops.slice(0, TOP_STOPS)} />
        </Section>

        <Section id="agency-delay" title="Where delays start" intro="Route directions where delay jumps on one stretch and stays up, and the typical minutes it adds there.">
          <StretchTable s={s} rows={s.delayStarts} caption="Stretches that add the most delay" valueHeader="Added" format={mins} />
        </Section>

        <Section id="agency-bunching" title="Where bunching forms" intro="Route directions where the share of gaps that are too short or too long steps up on one stretch and stays up.">
          <StretchTable s={s} rows={s.bunchingForms} caption="Stretches where bunching rises the most" />
        </Section>

        <MethodFootnote id="agency-method" groups={[
          { label: METHOD_GROUPS.numbers, items: [
            lateLine,
            lateAtStopLine(),
            runTimeLine(),
            extraWaitLine,
            bunchingLine(),
            deliveredLine(),
            <Term t="Where delays start">the stretch where delay jumps and stays up; directions where delay builds slowly have no single place and are left out.</Term>,
          ] },
          { label: METHOD_GROUPS.data, items: [
            w && weekWindowLine({ ...w, health: [] }),
            positionsLine,
            tripMatchLine(),
            <Term t="Covered">{coverage}{s.held.length ? ` (${s.held.map(h => h.route).join(', ')} not included)` : ''}.</Term>,
            <Term t="Network figures">every departure, trip or gap on the covered routes added up, not an average of route figures, so busy routes weigh more.</Term>,
            <Term t="Stops">at least 30 departures, at most 3 from one route direction.</Term>,
            builtText(s.generatedAt) + '.',
          ] },
          { label: METHOD_GROUPS.colours, items: [w && colourLine] },
          { label: METHOD_GROUPS.limits, items: [recordingGapsLine] },
        ]} />
      </article>
    </PageShell>
  );
}
