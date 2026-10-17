import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useParams } from 'react-router';
import { ATLAS_MODE, FEATURES, periodKeyForHour } from '../shared/config';
import {
  LINK_LABELS, freshness, linkValueText,
  type DashboardBand, type DashboardBandData, type LiveV3, type UncertainStart,
} from '../shared/liveDashboard';
import { delayAmount, headwayAmount } from '../shared/headwayText';
import { SITE_URL } from '../shared/seo';
import { useLiveDashboard } from './hooks/useLiveDashboard';
import { devOnly, liveReportTitle, withoutDevHint } from './lib/liveReportData';
import { applySeoToDocument } from './lib/seoDom';
import { syncUrlParams } from './utils/syncUrlParams';
import { shortStopName } from './utils/stopLabel';
import { TILE } from './pageStyles';
import ErrorBoundary from './components/ErrorBoundary';
import PageShell from './components/ui/PageShell';
import PillGroup, { PILL_ROW } from './components/ui/PillGroup';
import ArrowLink from './components/ui/ArrowLink';
import { PageTitle } from './components/ui/PageTitle';
import LiveOffNotice from './components/LiveOffNotice';
import HourBars from './components/charts/HourBars';
import type { RouteStripMode } from './components/Live/RouteStrip';
import DirectionStrip, { directionStopsById } from './components/Live/DirectionStrip';
import { delayText, type RouteStripStop } from './components/Live/routeStripModel';
import { KpiRow } from './LiveDashboardView';
import Section from './components/Live/sections/Section';
import WorstStopsSection from './components/Live/sections/WorstStopsSection';
import RunTimeSection from './components/Live/sections/RunTimeSection';
import MethodSection from './components/Live/sections/MethodSection';
import DeliveredSection from './components/Live/sections/DeliveredSection';
import ExtraWaitSection from './components/Live/sections/ExtraWaitSection';
import BunchingSection from './components/Live/sections/BunchingSection';
import BuildupSection from './components/Live/sections/BuildupSection';
import { BANDS, dirsOf, mins, pct } from './components/Live/sections/figures';
import { BOUNDARY, routeSubtitle, withNiceNames } from './LiveRoutePage';
import { lateCount, lateHourLine, LATE_BY_HOUR_TITLE } from '../shared/liveWording';

type Day = 'all' | 'weekday' | 'weekend';
const DAYS: [Day, string][] = [['all', 'All days'], ['weekday', 'Weekdays'], ['weekend', 'Weekends']];
export { BANDS };

/** What is open in the detail panel: a stop (by its place in the direction's strip) or a marked stretch. */
type Selection = { dir: number; kind: 'stop'; stopId: string } | { dir: number; kind: 'stretch'; mode: RouteStripMode };

export { dirsOf };
const readParam = (key: string) => new URLSearchParams(window.location.search).get(key);

export const Group = PillGroup;

function Fact({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-[var(--border-primary)] py-2 last:border-b-0">
      <dt className="text-sm text-[var(--text-muted)]">{label}</dt>
      <dd className="m-0 text-right">
        <span className="text-base font-black tracking-tight">{value}</span>
        {sub && <span className="block text-xs text-[var(--text-dim)]">{sub}</span>}
      </dd>
    </div>
  );
}

function Block({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="mt-4 first:mt-0">
      {title && <h4 className="text-sm font-black">{title}</h4>}
      <dl className="m-0">{children}</dl>
    </div>
  );
}

/** Everything known about the picked stop or stretch, for the time of day chosen above. */
function DetailPanel({ v3, band, sel, stops, data }: { v3: LiveV3; band: DashboardBand; sel: Selection; stops: Map<string, RouteStripStop>; data: DashboardBandData }) {
  const strip = { label: v3.directionLabels[String(sel.dir)] };
  const buildup = data.buildup.find(b => b.directionId === sel.dir);
  const bunchBand = v3.bunching.find(b => b.directionId === sel.dir)?.bands[band];
  const nice = (n: string) => shortStopName(n);

  if (sel.kind === 'stretch') {
    if (sel.mode === 'delay') {
      const f = buildup?.forms;
      if (!f) return null;
      return (
        <Panel title={`${nice(f.fromName)} to ${nice(f.toName)}`} sub={strip.label}>
          <Block>
            <Fact label="Typical added" value={mins(f.medianAddedMin)} />
            <Fact label="Trips where it grows" value={pct(f.growShare)} sub={`of ${f.n.toLocaleString()}`} />
            <Fact label="Typical delay" value={mins(f.medianDelayMin)} />
            <Fact label="1 in 10 later than" value={mins(f.p90DelayMin)} />
          </Block>
        </Panel>
      );
    }
    const b = bunchBand?.forms;
    if (!b) return null;
    const linked = b.links.filter(l => l.linked);
    return (
      <Panel title={`${nice(b.fromName)} to ${nice(b.toName)}`} sub={strip.label}>
        <Block>
          <Fact label="Gaps off the timetable" value={`${pct(b.fromBadShare)} to ${pct(b.toBadShare)}`} />
        </Block>
        <Block title={linked.length ? 'Linked to' : 'Nothing measured here is linked to it'}>
          {b.links.map(l => (
            <Fact key={l.kind} label={`${l.value == null ? 'Not measured' : l.linked ? 'Linked' : 'Not linked'}: ${LINK_LABELS[l.kind]}`} value={l.value == null ? '' : linkValueText(l.kind, l.value)} />
          ))}
        </Block>
      </Panel>
    );
  }

  const s = stops.get(sel.stopId);
  if (!s) return null;
  const full = data.stops.find(x => x.stopId === s.stopId && x.directionId === sel.dir);
  const bunch = bunchBand?.stops.find(x => x.stopId === s.stopId);
  const extra = v3.extraWait?.[band]?.find(x => x.directionId === sel.dir && x.stopId === s.stopId);
  const into = buildup?.stretches.find(x => x.toStopId === s.stopId);
  return (
    <Panel title={s.name} sub={strip.label}>
      <Block>
        {s.n > 0 && s.delayMin != null ? (
          <>
            <Fact label="Typical delay" value={delayText(s.delayMin)} />
            {full && <Fact label="1 in 10 later than" value={mins(full.p90Min)} />}
            {s.lateShare != null && <Fact label="Late" value={pct(s.lateShare)} sub={`of ${s.n.toLocaleString()} departures`} />}
          </>
        ) : <Fact label="Typical delay" value="not measured" />}
        {s.uncertain && <p className="mt-2 text-xs text-[var(--text-dim)]">Less exact here: vehicles report their location less often</p>}
      </Block>
      {bunch && bunch.n > 0 && (
        <Block>
          <Fact label="Too close together" value={pct(bunch.bunchedShare)} />
          <Fact label="Too far apart" value={pct(bunch.gappedShare)} sub={`${bunch.n.toLocaleString()} gaps`} />
        </Block>
      )}
      {extra && (
        <Block>
          <Fact label="Extra wait" value={delayAmount(Math.max(0, extra.extraWaitMin))} sub={`Scheduled every ${headwayAmount(extra.scheduledGapMin)}`} />
        </Block>
      )}
      {into && into.n > 0 && (
        <Block title={`${nice(into.fromName)} to ${nice(into.toName)}`}>
          <Fact label="Typical added" value={mins(into.medianAddedMin)} />
          <Fact label="Trips where it grows" value={pct(into.growShare)} sub={`of ${into.n.toLocaleString()}`} />
        </Block>
      )}
    </Panel>
  );
}

function Panel({ title, sub, children }: { title: string; sub: string; children: ReactNode }) {
  return (
    <aside className={`${TILE} min-w-0 lg:sticky lg:top-4`} aria-live="polite">
      <h3 className="text-lg font-black leading-tight">{title}</h3>
      <div className="mt-0.5 text-xs text-[var(--text-dim)]">{sub}</div>
      <div className="mt-3">{children}</div>
    </aside>
  );
}

function Main({ v3, band, dir, uncertain, sel, setSel }: {
  v3: LiveV3; band: DashboardBand; dir: number | null; uncertain: UncertainStart[]; sel: Selection; setSel: (s: Selection) => void;
}) {
  const data = v3.bands[band];
  const dirs = dirsOf(v3, dir);
  const stops = useMemo(() => directionStopsById(v3, sel.dir, band, uncertain), [v3, sel.dir, band, uncertain]);
  return (
    <div id="x-strip" className="mt-6 scroll-mt-4 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="min-w-0 space-y-8">
        {dirs.map(d => (
          <div key={d} className="min-w-0">
            <h3 className="mb-1 text-base font-black">{v3.directionLabels[String(d)]}</h3>
            <DirectionStrip
              v3={v3} directionId={d} band={band} uncertain={uncertain}
              selectedId={sel.dir === d && sel.kind === 'stop' ? sel.stopId : null}
              onSelect={stopId => setSel({ dir: d, kind: 'stop', stopId })}
              selectedStretch={sel.dir === d && sel.kind === 'stretch' ? sel.mode : null}
              onSelectStretch={mode => setSel({ dir: d, kind: 'stretch', mode })}
            />
          </div>
        ))}
      </div>
      <DetailPanel v3={v3} band={band} sel={sel} stops={stops} data={data} />
    </div>
  );
}

/** Share of departures ahead, on time and late by hour for the chosen kind of day. */
function Late({ data, dir, day, band, lateMin }: { data: DashboardBandData; dir: number | null; day: Day; band: DashboardBand; lateMin: number }) {
  const block = data.adherence.timepoints[day];
  const c = dir == null ? block.overall : block.byDirection[String(dir)];
  const label = DAYS.find(([k]) => k === day)![1];
  const parts = [{ name: 'Ahead', color: 'var(--status-caution-text)' }, { name: 'On time', color: 'var(--status-positive-text)' }, { name: 'Late', color: 'var(--status-negative-text)' }];
  if (!c || c.n === 0) return <p className="mt-3 text-sm text-[var(--text-muted)]">Not enough departures at stops with a scheduled time.</p>;
  return (
    <div className="mt-4 grid items-start gap-6 md:grid-cols-[14rem_minmax(0,1fr)]">
      <div className={TILE}>
        <div className="text-xs font-bold text-[var(--text-muted)]">{label}</div>
        <div className="mt-1 text-3xl font-black tracking-tight">{pct(c.lateShare)}</div>
        <div className="mt-1 text-xs text-[var(--text-dim)]">late, of {c.n.toLocaleString()} · {pct(c.earlyShare)} ahead</div>
        <div className="mt-1 text-xs text-[var(--text-dim)]">{lateMin}+ min</div>
      </div>
      <HourBars
                  hoverLine={(t, c) => lateHourLine(t, lateCount(c.parts[2], c.n), c.n)}
                  departures
        ariaLabel={`${label}: share of departures ahead of the timetable, on time and late, by hour of the day. ${pct(c.lateShare)} late overall.`}
        parts={parts}
        columns={block.byHour.filter(h => band === 'all' || periodKeyForHour(h.hour) === band).map(h => ({ hour: h.hour, n: h.n, parts: [h.earlyShare, h.onTimeShare, h.lateShare] }))}
      />
    </div>
  );
}

export default function LiveExplorePage() {
  const { agency = '', route = '' } = useParams();
  const state = useLiveDashboard(FEATURES.liveReports ? agency : null, route);
  const [dir, setDir] = useState<number | null>(() => { const d = readParam('dir'); return d != null && d !== '' && !Number.isNaN(Number(d)) ? Number(d) : null; });
  const [day, setDay] = useState<Day>(() => { const d = readParam('day'); return d === 'weekday' || d === 'weekend' ? d : 'all'; });
  const [band, setBand] = useState<DashboardBand>(() => { const b = readParam('band'); return BANDS.some(([k]) => k === b) ? (b as DashboardBand) : 'all'; });
  const [picked, setPicked] = useState<Selection | null>(null);
  useEffect(() => { syncUrlParams({ view: 'explore', dir: dir == null ? null : String(dir), day: day === 'all' ? null : day, band: band === 'all' ? null : band }); }, [dir, day, band]);
  const routeTitle = state.kind === 'done' && state.data.status === 'ready' ? state.data.routeTitle : null;
  useEffect(() => {
    if (!agency || !route) return;
    applySeoToDocument(document, { title: liveReportTitle(routeTitle || `${agency.toUpperCase()} ${route}`), description: '', canonicalUrl: `${ATLAS_MODE === 'public' ? SITE_URL : window.location.origin}${window.location.pathname}`, noindex: true, matchedPath: window.location.pathname });
  }, [agency, route, routeTitle]);
  if (!FEATURES.liveReports) return <LiveOffNotice />;
  const title = `${agency.toUpperCase()} ${route}`;
  const back = FEATURES.live ? <ArrowLink href="/apps/live" className="mt-6">Open Live</ArrowLink> : null;
  const shell = (body: ReactNode) => <PageShell variant="wide" maxWidth="max-w-[1600px]">{body}</PageShell>;
  if (state.kind === 'loading') return shell(<p className="mt-24 text-sm text-[var(--text-muted)]" aria-busy="true">Loading {title}…</p>);
  if (state.kind === 'error') return shell(<><PageTitle className="mt-24">{title}</PageTitle><p className="mt-4 max-w-2xl text-base leading-7 text-[var(--text-muted)]">{state.reason}</p>{back}</>);
  const data = state.data;
  if (data.status !== 'ready') {
    return shell(<><PageTitle className="mt-24">{title}</PageTitle><p className="mt-4 max-w-2xl text-base leading-7 text-[var(--text-muted)]">{data.status === 'no_analysis' ? devOnly(data.reason) : data.reason}</p>{back}</>);
  }
  const v3 = (() => { try { return withNiceNames(data.v3); } catch { return data.v3; } })();
  const bandData = v3.bands?.[band] as DashboardBandData;
  const uncertain = data.uncertainStart ?? [];

  // The strip opens on where delay builds up when the route has such a stretch, else on its first stop.
  const firstDir = dirsOf(v3, dir)[0];
  const fallback: Selection = (() => {
    for (const d of dirsOf(v3, dir)) {
      if (bandData.buildup.find(b => b.directionId === d)?.forms) return { dir: d, kind: 'stretch', mode: 'delay' } as Selection;
    }
    const first = [...directionStopsById(v3, firstDir, band, uncertain).keys()][0];
    return { dir: firstDir, kind: 'stop', stopId: first };
  })();
  const sel: Selection = (() => {
    if (!picked || (dir != null && picked.dir !== dir)) return fallback;
    if (picked.kind === 'stretch') {
      const ok = picked.mode === 'delay' ? bandData.buildup.find(b => b.directionId === picked.dir)?.forms : v3.bunching.find(b => b.directionId === picked.dir)?.bands[band]?.forms;
      return ok ? picked : fallback;
    }
    return picked;
  })();

  // A stop picked in a table opens in the panel, and the strip scrolls into view.
  // Stops off the strip's usual pattern are not on it, so their names stay plain text.
  const onStrip = (d: number, stopId: string) => directionStopsById(v3, d, band, uncertain).has(stopId);
  const pickStop = (d: number, stopId: string) => {
    if (!onStrip(d, stopId)) return;
    setPicked({ dir: d, kind: 'stop', stopId });
    document.getElementById('x-strip')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return shell(
    <article className="pb-16 pt-10 sm:pt-14">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <PageTitle>{data.routeTitle || title}</PageTitle>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            {routeSubtitle(v3, agency)}
          </p>
        </div>
        {FEATURES.live && <ArrowLink href="/apps/live" className="shrink-0 whitespace-nowrap">View on Live map</ArrowLink>}
      </div>
      {(() => {
        const f = freshness(v3, route, Date.now());
        return f.stale ? <p className="mt-2 text-sm font-bold text-[var(--status-caution-text)]" role="status">{withoutDevHint(f.text)}</p> : null;
      })()}
      {data.note && <p className="mt-4 max-w-3xl text-sm font-bold text-[var(--status-caution-text)]">{data.note}</p>}

      <ErrorBoundary label={BOUNDARY('This week compared with last week')}><KpiRow v3={v3} /></ErrorBoundary>

      <div className={`mt-6 ${PILL_ROW}`} role="group" aria-label="Filters">
        <Group label="Direction" value={dir == null ? 'both' : String(dir)} onChange={v => setDir(v === 'both' ? null : Number(v))}
          options={[['both', 'Both directions'], ...dirsOf(v3, null).map(d => [String(d), v3.directionLabels[String(d)]] as const)]} />
        <Group label="Time of day" value={band} onChange={v => setBand(v as DashboardBand)} options={BANDS} />
      </div>

      <ErrorBoundary label={BOUNDARY('Along the route')}>
        <Main v3={v3} band={band} dir={dir} uncertain={uncertain} sel={sel} setSel={setPicked} />
      </ErrorBoundary>

      <Section shrink id="x-late" title={LATE_BY_HOUR_TITLE}>
        <div className="mt-3"><Group label="Day" value={day} onChange={v => setDay(v as Day)} options={DAYS} /></div>
        <ErrorBoundary label={BOUNDARY(LATE_BY_HOUR_TITLE)}><Late data={bandData} dir={dir} day={day} band={band} lateMin={v3.thresholds.lateAtOrAboveMin} /></ErrorBoundary>
      </Section>
      <RunTimeSection v3={v3} band={band} dir={dir} detail="compact" id="x-runtime" shrink boundary={BOUNDARY('Run time')} />
      <BuildupSection v3={v3} data={bandData} dir={dir} uncertain={uncertain} detail="compact" boundary={BOUNDARY('Where delays build up')} />
      <ExtraWaitSection v3={v3} band={band} dir={dir} detail="compact" boundary={BOUNDARY('Extra wait')} />
      <BunchingSection v3={v3} dir={dir} band={band} detail="compact" boundary={BOUNDARY('Where bunching forms')} />
      <DeliveredSection v3={v3} dir={dir} detail="compact" boundary={BOUNDARY('Service delivered')} />
      <WorstStopsSection v3={v3} data={bandData} dir={dir} uncertain={uncertain} limit={10} columns="full" title="Stops with the most delay" id="x-stops" shrink boundary={BOUNDARY('Stops with the most delay')} onPick={pickStop} canPick={onStrip} />
      <ErrorBoundary label="How this is measured could not be drawn."><MethodSection scope="route" data={data} /></ErrorBoundary>
    </article>,
  );
}
