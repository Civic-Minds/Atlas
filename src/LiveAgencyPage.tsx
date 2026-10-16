import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { ATLAS_MODE, FEATURES } from '../shared/config';
import { coverageText, type AgencyHotspotStop, type AgencyHotspotStretch, type AgencyRouteRow, type AgencySummary } from '../shared/liveAgency';
import { dateRangeText, NOISE_RULE } from '../shared/liveDashboard';
import type { LiveAgencyResponse } from '../local-api/live-agency';
import { devOnly, liveAgencyDataUrl, liveDataMissing, liveReportTitle, withoutDevHint } from './lib/liveReportData';
import { applySeoToDocument } from './lib/seoDom';
import { SITE_URL } from '../shared/seo';
import { liveDashboardPath } from './hooks/useLiveDashboard';
import { routesByMode } from '../shared/agencyPages';
import { RouteNameCell } from './pageParts';
import { agencyKpiTiles } from './utils/liveAgencyKpi';
import { weekCaption, weekRangeLine } from './utils/liveKpi';
import { syncUrlParams } from './utils/syncUrlParams';
import { titleCase } from './utils/format';
import { shortStopName } from './utils/stopLabel';
import ErrorBoundary from './components/ErrorBoundary';
import PageShell from './components/ui/PageShell';
import DataTable from './components/ui/DataTable';
import SortableDataTable from './components/ui/SortableDataTable';
import LiveOffNotice from './components/LiveOffNotice';
import { KpiTiles } from './LiveDashboardView';
import ArrowLink from './components/ui/ArrowLink';
import { PageTitle, SectionTitle } from './components/ui/PageTitle';

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

/** A hotspot's route, in the Routes table's name style, then its direction. */
function HotspotRoute({ s, route, direction }: { s: AgencySummary; route: string; direction: string }) {
  const r = s.routes.find(x => x.route === route);
  return <><a href={liveDashboardPath(s.agency, route)} className="hover:underline"><RouteNameCell shortName={route} longName={r?.longName} mode={r?.mode ?? 3} agencyName={s.agency.toUpperCase()} /></a> <span className="text-[var(--text-muted)]">{titleCase(direction)}</span></>;
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
              { key: 'late', sortable: true, header: 'Late', cell: r => <span title={`${r.lateN.toLocaleString()} departures at timepoints this week`}>{pct(r.lateShare)}</span> },
              { key: 'lastWeek', header: 'Last week', className: 'text-[var(--text-muted)]', cell: r => pct(r.lateLastWeek) },
              { key: 'runTime', sortable: true, header: 'Run time', cell: r => pctSigned(r.runTimeOver) },
              { key: 'bunching', sortable: true, header: 'Bunching', cell: r => pct(r.bunchingShare) },
              { key: 'delivered', sortable: true, header: 'Delivered', cell: r => (r.deliveredShare == null ? '–' : `${(Math.floor(r.deliveredShare * 1000) / 10).toString()}%`) },
            ]}
          />
        </div>
      ))}
      <p className="mt-2 max-w-3xl text-xs leading-5 text-[var(--text-dim)]">
        Late: departures 5.5+ minutes after the timetable, at stops where it gives a time. Run time: the typical trip over the main stretch against its scheduled time. Bunching: gaps under 2 minutes or over twice the scheduled gap. Delivered: scheduled trips that ran. All for this week.
      </p>
    </>
  );
}

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
          { key: 'stop', header: 'Stop', rowHeader: true, className: 'font-normal', cell: r => stop(r.name) },
          { key: 'route', header: 'Route', cell: r => <HotspotRoute s={s} route={r.route} direction={r.direction} /> },
          { key: 'late', header: 'Late', worst: r => r.lateShare, cell: r => pct(r.lateShare) },
          { key: 'typical', header: 'Typical', worst: r => r.medianMin, cell: r => mins(r.medianMin) },
          { key: 'p90', header: '1 in 10 later than', worst: r => r.p90Min, cell: r => mins(r.p90Min) },
          { key: 'n', header: 'Departures', cell: r => r.n.toLocaleString() },
        ]}
      />
    </div>
  );
}

function StretchTable({ s, rows, caption, valueHeader, format }: { s: AgencySummary; rows: AgencyHotspotStretch[]; caption: string; valueHeader: string; format: (v: number) => string }) {
  if (!rows.length) return <p className="mt-3 text-sm text-[var(--text-muted)]">No stretch stands out on the analysed routes.</p>;
  return (
    <div className="relative mt-3 overflow-x-auto">
      <SortableDataTable
        caption={caption}
        rows={rows}
        defaultSort="value"
        rowKey={r => `${r.route}-${r.directionId}-${r.fromStopId}-${r.toStopId}`}
        columns={[
          { key: 'stretch', header: 'Stretch', rowHeader: true, className: 'font-normal', cell: r => `${stop(r.fromName)} to ${stop(r.toName)}` },
          { key: 'route', header: 'Route', cell: r => <HotspotRoute s={s} route={r.route} direction={r.direction} /> },
          { key: 'value', header: valueHeader, worst: r => r.value, cell: r => format(r.value) },
        ]}
      />
    </div>
  );
}

export default function LiveAgencyPage() {
  const { agency = '' } = useParams();
  // Live off: no request at all, only the notice.
  const state = useLiveAgency(FEATURES.liveReports ? agency : '');
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
  const coverage = coverageText(s);
  const w = s.weekly;
  const dates = w?.thisWeek.dates ?? [];
  const tiles = agencyKpiTiles(s, coverage);
  return (
    <PageShell variant="wide">
      <article className="pb-16 pt-10 sm:pt-14">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <PageTitle>{name}: how the network is running</PageTitle>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              {dates.length ? `${dateRangeText(dates[0], dates[dates.length - 1])} · ` : ''}{coverage} · estimated from where vehicles were, not reported by {name}
            </p>
          </div>
          {FEATURES.live && <ArrowLink href="/apps/live">View on Live map</ArrowLink>}
        </div>
        <p className="mt-4 max-w-3xl text-sm font-bold text-[var(--status-caution-text)]">
          These figures cover only the {s.covered.length} routes Live has analysed so far ({s.covered.join(', ')}), not the whole network.
        </p>
        <ErrorBoundary>
          {w && tiles.length
            ? <KpiTiles tiles={tiles} caption={weekRangeLine({ ...w, health: [] })} />
            : <p className="mt-5 text-sm text-[var(--text-muted)]">{withoutDevHint('This week against last week is not in the analysis files yet. Rebuild them with npm run live:analyze.')}</p>}
        </ErrorBoundary>

        <Section id="agency-routes" title="Routes" intro="Every analysed route, worst first.">
          <RoutesTable s={s} />
        </Section>

        <Section id="agency-stops" title="Stops where the most cars leave late" intro={`The ${s.worstStops.length} stops with the highest share of departures 5.5+ minutes late, across all analysed routes (stops with at least 30 departures, at most 3 from one route direction).`}>
          <StopsTable s={s} rows={s.worstStops} />
        </Section>

        <Section id="agency-delay" title="Where delays start" intro="Route directions where delay jumps on one stretch and stays up, and the typical minutes it adds there. Directions where delay builds slowly have no single place and are left out.">
          <StretchTable s={s} rows={s.delayStarts} caption="Stretches that add the most delay" valueHeader="Added" format={mins} />
        </Section>

        <Section id="agency-bunching" title="Where bunching forms" intro="Route directions where the share of gaps that are too short or too long steps up on one stretch and stays up, and by how much.">
          <StretchTable s={s} rows={s.bunchingForms} caption="Stretches where bunching rises the most" valueHeader="Rise" format={v => `+${Math.round(v * 100)} points`} />
        </Section>

        <Section id="agency-method" title="How this is measured">
          <ul className="mt-3 max-w-3xl list-disc space-y-1 pl-5 text-sm leading-6 text-[var(--text-muted)]">
            <li>Each route is measured the same way as on its own page: delay is when the car left each stop against the timetable, worked out from where it was seen about once a minute.</li>
            <li>Network figures add up every departure, trip or gap on the analysed routes; they are not an average of route figures, so busy routes weigh more than quiet ones.</li>
            {w && <li>This week compared with last week: {weekCaption({ ...w, health: [] })} {NOISE_RULE}</li>}
            <li>Covered: {coverage}. {s.held.length ? `Held back: ${s.held.map(h => `${h.route} (${h.reason})`).join(' ')}` : ''}</li>
            <li>Built {new Date(s.generatedAt).toLocaleString()}.</li>
          </ul>
        </Section>
      </article>
    </PageShell>
  );
}
