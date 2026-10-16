import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { ArrowRight } from 'lucide-react';
import { FEATURES } from '../shared/config';
import { coverageText, type AgencyHotspotStop, type AgencyHotspotStretch, type AgencyRouteRow, type AgencySummary } from '../shared/liveAgency';
import { dateRangeText, NOISE_RULE } from '../shared/liveDashboard';
import type { LiveAgencyResponse } from '../local-api/live-agency';
import { liveDashboardPath } from './hooks/useLiveDashboard';
import { agencyKpiTiles } from './utils/liveAgencyKpi';
import { weekCaption } from './utils/liveKpi';
import { syncUrlParams } from './utils/syncUrlParams';
import { titleCase } from './utils/format';
import { shortStopName } from './utils/stopLabel';
import ErrorBoundary from './components/ErrorBoundary';
import PageShell from './components/ui/PageShell';
import DataTable from './components/ui/DataTable';
import Pill from './components/ui/Pill';
import HourSpark from './components/charts/HourSpark';
import LiveOffNotice from './components/LiveOffNotice';
import { KpiTiles } from './LiveDashboardView';
import { PAGE_ACTION } from './pageStyles';

const MINUS = '−';
const pct = (x: number | null) => (x == null ? '–' : `${Math.round(x * 100)}%`);
const pctSigned = (x: number | null) => (x == null ? '–' : `${x > 0 ? '+' : x < 0 ? MINUS : ''}${Math.abs(Math.round(x * 100))}%`);
const num = (x: number) => (Math.round(x * 10) / 10).toString().replace('-', MINUS);
const mins = (x: number) => `${x > 0 ? '+' : ''}${num(x)} min`;
const stop = (name: string) => shortStopName(titleCase(name));

type Sort = 'late' | 'runTime' | 'bunching' | 'delivered';
const SORTS: [Sort, string][] = [['late', 'Late'], ['runTime', 'Run time'], ['bunching', 'Bunching'], ['delivered', 'Service delivered']];
const sortValue: Record<Sort, (r: AgencyRouteRow) => number> = {
  late: r => r.lateShare ?? -1,
  runTime: r => r.runTimeOver ?? -Infinity,
  bunching: r => r.bunchingShare ?? -1,
  // Fewest trips delivered first.
  delivered: r => -(r.deliveredShare ?? 2),
};

function useLiveAgency(agency: string): { kind: 'loading' } | { kind: 'error'; reason: string } | { kind: 'done'; data: LiveAgencyResponse } {
  const [state, setState] = useState<{ kind: 'loading' } | { kind: 'error'; reason: string } | { kind: 'done'; data: LiveAgencyResponse }>({ kind: 'loading' });
  useEffect(() => {
    let live = true;
    fetch(`/api/live-agency?agency=${encodeURIComponent(agency)}`)
      .then(r => r.json() as Promise<LiveAgencyResponse>)
      .then(data => { if (live) setState({ kind: 'done', data }); })
      .catch(() => { if (live) setState({ kind: 'error', reason: 'The Live API did not answer. Start Live with "npm run live" and open this page on the address it prints.' }); });
    return () => { live = false; };
  }, [agency]);
  return state;
}

function Section({ id, title, intro, children }: { id: string; title: string; intro?: string; children: React.ReactNode }) {
  return (
    <section className="mt-12" aria-labelledby={id}>
      <h2 id={id} className="text-xl font-black tracking-tight">{title}</h2>
      {intro && <p className="mt-1 max-w-3xl text-sm text-[var(--text-muted)]">{intro}</p>}
      <ErrorBoundary>{children}</ErrorBoundary>
    </section>
  );
}

function RouteLink({ agency, route, label }: { agency: string; route: string; label: string }) {
  return <a href={liveDashboardPath(agency, route)} className="font-bold text-[var(--accent)] hover:underline">{label}</a>;
}

function RoutesTable({ s }: { s: AgencySummary }) {
  const [sort, setSort] = useState<Sort>(() => {
    const v = new URLSearchParams(window.location.search).get('sort');
    return SORTS.some(([k]) => k === v) ? v as Sort : 'late';
  });
  useEffect(() => { syncUrlParams({ sort: sort === 'late' ? null : sort }); }, [sort]);
  const rows = [...s.routes].sort((a, b) => sortValue[sort](b) - sortValue[sort](a) || a.route.localeCompare(b.route, undefined, { numeric: true }));
  const lateMax = Math.max(0.1, ...s.routes.flatMap(r => r.lateByHour.filter(h => h.n >= 30).map(h => h.value)));
  const scale = { min: 0, max: Math.ceil(lateMax * 10) / 10 };
  return (
    <>
      <div className="mt-4 flex flex-wrap items-center gap-1.5" role="group" aria-label="Sort routes by">
        <span className="mr-1 text-sm text-[var(--text-muted)]">Worst first by</span>
        {SORTS.map(([k, label]) => <Pill key={k} size="segment" selected={sort === k} onClick={() => setSort(k)}>{label}</Pill>)}
      </div>
      <div className="relative mt-3 overflow-x-auto">
        <DataTable
          variant="ruled"
          caption={`${s.agency.toUpperCase()} routes with Live analysis, worst first by ${SORTS.find(([k]) => k === sort)![1].toLowerCase()}`}
          rows={rows}
          rowKey={r => r.route}
          columns={[
            { key: 'route', header: 'Route', rowHeader: true, className: 'font-normal', cell: r => <RouteLink agency={s.agency} route={r.route} label={r.label} /> },
            { key: 'late', header: 'Late', className: 'whitespace-nowrap', cell: r => <span title={`${r.lateN.toLocaleString()} departures at timepoints this week`}>{pct(r.lateShare)}</span> },
            { key: 'lastWeek', header: 'Last week', className: 'whitespace-nowrap text-[var(--text-muted)]', cell: r => pct(r.lateLastWeek) },
            { key: 'runTime', header: 'Run time', className: 'whitespace-nowrap', cell: r => pctSigned(r.runTimeOver) },
            { key: 'bunching', header: 'Bunching', className: 'whitespace-nowrap', cell: r => pct(r.bunchingShare) },
            { key: 'delivered', header: 'Delivered', className: 'whitespace-nowrap', cell: r => (r.deliveredShare == null ? '–' : `${(Math.floor(r.deliveredShare * 1000) / 10).toString()}%`) },
            {
              key: 'hours', header: 'Late by hour', className: 'w-56 min-w-[12rem]', cell: r => (
                <HourSpark values={r.lateByHour} scale={scale} color="var(--status-negative-text)" format={v => `${Math.round(v * 100)}% late`}
                  ariaLabel={`${r.label}: share of departures 5.5+ minutes late, by hour of day`} unit="departures" valueHeader="Late" />
              ),
            },
          ]}
        />
      </div>
      <p className="mt-2 max-w-3xl text-xs leading-5 text-[var(--text-dim)]">
        Late: departures 5.5+ minutes after the timetable, at stops where it gives a time. Run time: the typical trip over the main stretch against its scheduled time. Bunching: gaps under 2 minutes or over twice the scheduled gap. Delivered: scheduled trips that ran. All for this week.
      </p>
    </>
  );
}

function StopsTable({ agency, rows }: { agency: string; rows: AgencyHotspotStop[] }) {
  if (!rows.length) return <p className="mt-3 text-sm text-[var(--text-muted)]">No stop has enough departures to rank yet.</p>;
  return (
    <div className="relative mt-3 overflow-x-auto">
      <DataTable
        variant="ruled"
        caption="Stops where the most cars leave late, all analysed routes"
        rows={rows}
        rowKey={r => `${r.route}-${r.directionId}-${r.stopId}`}
        columns={[
          { key: 'stop', header: 'Stop', rowHeader: true, className: 'font-normal', cell: r => stop(r.name) },
          { key: 'route', header: 'Route', cell: r => <RouteLink agency={agency} route={r.route} label={`${r.route} ${titleCase(r.direction)}`} /> },
          { key: 'late', header: 'Late', className: 'whitespace-nowrap', cell: r => pct(r.lateShare) },
          { key: 'typical', header: 'Typical', className: 'whitespace-nowrap', cell: r => mins(r.medianMin) },
          { key: 'p90', header: '1 in 10 later than', className: 'whitespace-nowrap', cell: r => mins(r.p90Min) },
          { key: 'n', header: 'Departures', cell: r => r.n.toLocaleString() },
        ]}
      />
    </div>
  );
}

function StretchTable({ agency, rows, caption, valueHeader, format }: { agency: string; rows: AgencyHotspotStretch[]; caption: string; valueHeader: string; format: (v: number) => string }) {
  if (!rows.length) return <p className="mt-3 text-sm text-[var(--text-muted)]">No stretch stands out on the analysed routes.</p>;
  return (
    <div className="relative mt-3 overflow-x-auto">
      <DataTable
        variant="ruled"
        caption={caption}
        rows={rows}
        rowKey={r => `${r.route}-${r.directionId}-${r.fromStopId}-${r.toStopId}`}
        columns={[
          { key: 'stretch', header: 'Stretch', rowHeader: true, className: 'font-normal', cell: r => `${stop(r.fromName)} to ${stop(r.toName)}` },
          { key: 'route', header: 'Route', cell: r => <RouteLink agency={agency} route={r.route} label={`${r.route} ${titleCase(r.direction)}`} /> },
          { key: 'value', header: valueHeader, className: 'whitespace-nowrap', cell: r => format(r.value) },
        ]}
      />
    </div>
  );
}

export default function LiveAgencyPage() {
  const { agency = '' } = useParams();
  const state = useLiveAgency(agency);
  if (!FEATURES.live) return <LiveOffNotice />;
  const name = agency.toUpperCase();
  const back = <a href="/apps/live" className={`${PAGE_ACTION} mt-6`}>Open Live <ArrowRight className="h-4 w-4" aria-hidden="true" /></a>;
  if (state.kind === 'loading') return <PageShell variant="wide"><p className="mt-24 text-sm text-[var(--text-muted)]" aria-busy="true">Loading {name}…</p></PageShell>;
  if (state.kind === 'error' || state.data.status !== 'ready') {
    const reason = state.kind === 'error' ? state.reason : (state.data as { reason: string }).reason;
    return <PageShell variant="wide"><h1 className="mt-24 text-3xl font-black tracking-tight">{name}</h1><p className="mt-4 max-w-2xl text-base leading-7 text-[var(--text-muted)]">{reason}</p>{back}</PageShell>;
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
            <h1 className="text-2xl font-black tracking-tight sm:text-3xl">{name}: how the network is running</h1>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              {dates.length ? `${dateRangeText(dates[0], dates[dates.length - 1])} · ` : ''}{coverage} · estimated from where vehicles were, not reported by {name}
            </p>
          </div>
          <a href="/apps/live" className={PAGE_ACTION}>View on Live map <ArrowRight className="h-4 w-4" aria-hidden="true" /></a>
        </div>
        <p className="mt-4 max-w-3xl text-sm font-bold text-[var(--status-caution-text)]">
          These figures cover only the {s.covered.length} routes Live has analysed so far ({s.covered.join(', ')}), not the whole network.
        </p>
        <ErrorBoundary>
          {w && tiles.length
            ? <KpiTiles tiles={tiles} caption={`Each figure counts every departure, trip or gap on these routes, so busy routes weigh more than quiet ones. ${weekCaption({ ...w, health: [] })} ${NOISE_RULE}`} />
            : <p className="mt-5 text-sm text-[var(--text-muted)]">This week against last week is not in the analysis files yet. Rebuild them with npm run live:analyze.</p>}
        </ErrorBoundary>

        <Section id="agency-routes" title="Routes" intro="Every analysed route, worst first. Open a route for its own dashboard.">
          <RoutesTable s={s} />
        </Section>

        <Section id="agency-stops" title="Stops where the most cars leave late" intro={`The ${s.worstStops.length} stops with the highest share of departures 5.5+ minutes late, across all analysed routes (stops with at least 30 departures, at most 3 from one route direction).`}>
          <StopsTable agency={s.agency} rows={s.worstStops} />
        </Section>

        <Section id="agency-delay" title="Where delays start" intro="Route directions where delay jumps on one stretch and stays up, and the typical minutes it adds there. Directions where delay builds slowly have no single place and are left out.">
          <StretchTable agency={s.agency} rows={s.delayStarts} caption="Stretches that add the most delay" valueHeader="Added" format={mins} />
        </Section>

        <Section id="agency-bunching" title="Where bunching forms" intro="Route directions where the share of gaps that are too short or too long steps up on one stretch and stays up, and by how much.">
          <StretchTable agency={s.agency} rows={s.bunchingForms} caption="Stretches where bunching rises the most" valueHeader="Rise" format={v => `+${Math.round(v * 100)} points`} />
        </Section>

        <Section id="agency-method" title="How this is measured">
          <ul className="mt-3 max-w-3xl list-disc space-y-1 pl-5 text-sm leading-6 text-[var(--text-muted)]">
            <li>Each route is measured the same way as on its own page: delay is when the car left each stop against the timetable, worked out from where it was seen about once a minute.</li>
            <li>Network figures add up every departure, trip or gap on the analysed routes; they are not an average of route figures.</li>
            <li>Covered: {coverage}. {s.held.length ? `Held back: ${s.held.map(h => `${h.route} (${h.reason})`).join(' ')}` : ''}</li>
            <li>Built {new Date(s.generatedAt).toLocaleString()}.</li>
          </ul>
        </Section>
      </article>
    </PageShell>
  );
}
