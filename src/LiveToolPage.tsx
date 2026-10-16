import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useParams } from 'react-router';
import { FEATURES } from '../shared/config';
import { delayAmount, headwayAmount } from '../shared/headwayText';
import type { AgencySummary } from '../shared/liveAgency';
import type { DashboardBand, DashboardBandData, LiveV3 } from '../shared/liveDashboard';
import { useLiveDashboard } from './hooks/useLiveDashboard';
import { useLiveAgency } from './LiveAgencyPage';
import { devOnly, liveReportTitle } from './lib/liveReportData';
import { applySeoToDocument } from './lib/seoDom';
import { syncUrlParams } from './utils/syncUrlParams';
import { shortStopName } from './utils/stopLabel';
import ErrorBoundary from './components/ErrorBoundary';
import LiveOffNotice from './components/LiveOffNotice';
import AtlasBrand from './components/AtlasBrand';
import RoutePicker, { orderRoutes } from './components/Live/RoutePicker';
import RouteMap, { type MapPick } from './components/Live/RouteMap';
import { directionStopsById } from './components/Live/DirectionStrip';
import { MAP_STEP_LIMITS, MEASURES, routeMapModel, type MapMeasure } from './components/Live/routeMapModel';
import { STEP_LABELS } from './components/Live/routeStripModel';
import { delayText } from './components/Live/routeStripModel';
import { BANDS, Block, DetailPanel, Fact, Group, Late, Panel, RunTime, type Selection } from './LiveExplorePage';
import { withNiceNames } from './LiveRoutePage';

const pct = (x: number) => `${Math.round(x * 100)}%`;
const mins = (x: number) => `${x > 0 ? '+' : ''}${Math.round(x * 10) / 10} min`.replace('-', '−');
const readParam = (key: string) => new URLSearchParams(window.location.search).get(key);

/** The three step labels of a measure's key: the bunching key the strips already use, and the same shape for the others. */
function stepLabels(measure: MapMeasure): [string, string, string] {
  if (measure === 'bunching') return [...STEP_LABELS.bunching] as [string, string, string];
  const [a, b] = MAP_STEP_LIMITS[measure];
  if (measure === 'late') return [`Under ${pct(a)}`, `${pct(a)}–${pct(b)}`, `${pct(b)} or more`];
  const m = (x: number) => `${x} min`;
  return [`Under ${m(a)}`, `${a}–${m(b)}`, `${m(b)} or more`];
}
const STEP_VAR = (measure: MapMeasure, step: number) => `var(--strip-${measure === 'bunching' ? 'bunching' : 'delay'}-${step})`;

function Key({ measure }: { measure: MapMeasure }) {
  const labels = stepLabels(measure);
  return (
    <div className="pointer-events-none absolute left-3 top-3 z-10 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-header)] px-3 py-2 text-xs shadow-sm">
      <div className="font-bold text-[var(--text-secondary)]">{MEASURES.find(([k]) => k === measure)![1]}</div>
      <ul className="m-0 mt-1 flex flex-col gap-1 p-0">
        {labels.map((l, i) => (
          <li key={l} className="flex list-none items-center gap-2 text-[var(--text-legend)]"><span aria-hidden="true" className="inline-block h-2.5 w-5 rounded-full" style={{ background: STEP_VAR(measure, i) }} />{l}</li>
        ))}
        <li className="flex list-none items-center gap-2 text-[var(--text-legend)]"><span aria-hidden="true" className="inline-block h-2.5 w-5 rounded-full" style={{ background: 'var(--strip-delay-0)', opacity: 0.45 }} />Not measured</li>
      </ul>
    </div>
  );
}

/** The panel for a picked segment: the stretch's figures, then the stop it leaves. */
function SegmentPanel({ v3, band, dir, fromStopId, toStopId, data, stops }: { v3: LiveV3; band: DashboardBand; dir: number; fromStopId: string; toStopId: string; data: DashboardBandData; stops: ReturnType<typeof directionStopsById> }) {
  const a = stops.get(fromStopId), b = stops.get(toStopId);
  const stretch = data.buildup.find(x => x.directionId === dir)?.stretches.find(x => x.fromStopId === fromStopId && x.toStopId === toStopId);
  const full = data.stops.find(x => x.stopId === fromStopId && x.directionId === dir);
  const bunch = v3.bunching.find(x => x.directionId === dir)?.bands[band]?.stops.find(x => x.stopId === fromStopId);
  const extra = v3.extraWait?.[band]?.find(x => x.directionId === dir && x.stopId === fromStopId);
  return (
    <Panel docked title={`${shortStopName(a?.name ?? fromStopId)} to ${shortStopName(b?.name ?? toStopId)}`} sub={v3.directionLabels[String(dir)]}>
      {stretch && stretch.n > 0 && (
        <Block>
          <Fact label="Typical added" value={mins(stretch.medianAddedMin)} />
          <Fact label="Trips where it grows" value={pct(stretch.growShare)} sub={`of ${stretch.n.toLocaleString()}`} />
        </Block>
      )}
      <Block>
        {a && a.n > 0 && a.delayMin != null && <Fact label="Typical delay" value={delayText(a.delayMin)} />}
        {full && <Fact label="1 in 10 later than" value={mins(full.p90Min)} />}
        {a?.lateShare != null && a.n > 0 && <Fact label="Late" value={pct(a.lateShare)} sub={`of ${a.n.toLocaleString()} departures`} />}
      </Block>
      {bunch && bunch.n > 0 && (
        <Block>
          <Fact label="Too close together" value={pct(bunch.bunchedShare)} />
          <Fact label="Too far apart" value={pct(bunch.gappedShare)} sub={`${bunch.n.toLocaleString()} gaps`} />
        </Block>
      )}
      {extra && <Block><Fact label="Extra wait" value={delayAmount(Math.max(0, extra.extraWaitMin))} sub={`Scheduled every ${headwayAmount(extra.scheduledGapMin)}`} /></Block>}
    </Panel>
  );
}

function Canvas({ data, v3, route, dir, band, measure, pick, anchor, setPick }: {
  data: Extract<ReturnType<typeof useLiveDashboard>, { kind: 'done' }>['data'] & { status: 'ready' }; v3: LiveV3; route: string; dir: number; band: DashboardBand; measure: MapMeasure;
  pick: MapPick | null; anchor: [number, number] | null; setPick: (p: MapPick | null, at: [number, number] | null) => void;
}) {
  const bandData = v3.bands[band] as DashboardBandData;
  const uncertain = data.uncertainStart ?? [];
  const model = useMemo(() => routeMapModel(v3, dir, band, measure), [v3, dir, band, measure]);
  const stops = useMemo(() => directionStopsById(v3, dir, band, uncertain), [v3, dir, band, uncertain]);
  const hasChart = measure === 'late' || measure === 'runTime';
  const card = pick?.kind === 'segment' ? (
    <SegmentPanel v3={v3} band={band} dir={dir} fromStopId={pick.fromStopId} toStopId={pick.toStopId} data={bandData} stops={stops} />
  ) : pick?.kind === 'stop' && stops.has(pick.stopId) ? (
    <DetailPanel docked v3={v3} band={band} sel={{ dir, kind: 'stop', stopId: pick.stopId }} stops={stops} data={bandData} />
  ) : null;
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="relative min-h-0 flex-1">
        <RouteMap model={model} measure={measure} selected={pick} onPick={(p, at) => setPick(p, at)} anchor={anchor ?? (pick?.kind === 'stop' ? model.stops.find(x => x.stopId === pick.stopId)?.lonLat ?? null : null)} card={card} frameKey={`${route}-${dir}`} />
        <Key measure={measure} />
        {data.note && <p className="absolute bottom-3 left-3 right-3 z-10 m-0 rounded-lg bg-[var(--bg-header)] px-3 py-1.5 text-xs text-[var(--text-muted)] shadow-sm">{data.note}</p>}
      </div>
      {hasChart && (
        <div className="max-h-[40%] shrink-0 overflow-y-auto border-t border-[var(--border-primary)] bg-[var(--bg-app)] px-6 pb-4">
          <ErrorBoundary label="This chart could not be drawn.">
            {measure === 'late' ? <Late data={bandData} dir={dir} day="all" band={band} lateMin={v3.thresholds.lateAtOrAboveMin} /> : <RunTime v3={v3} band={band} dir={dir} />}
          </ErrorBoundary>
        </div>
      )}
    </div>
  );
}

function RouteCanvas({ agency, route, dir, setDir, band, measure, pick, anchor, setPick }: {
  agency: string; route: string; dir: number | null; setDir: (d: number) => void; band: DashboardBand; measure: MapMeasure; pick: MapPick | null; anchor: [number, number] | null; setPick: (p: MapPick | null, at: [number, number] | null) => void;
}) {
  const state = useLiveDashboard(agency, route);
  if (state.kind === 'loading') return <p className="p-6 text-sm text-[var(--text-muted)]" aria-busy="true">Loading {agency.toUpperCase()} {route}…</p>;
  if (state.kind === 'error') return <p className="p-6 text-sm text-[var(--text-muted)]">{state.reason}</p>;
  const data = state.data;
  if (data.status !== 'ready') return <p className="p-6 text-sm text-[var(--text-muted)]">{data.status === 'no_analysis' ? devOnly(data.reason) : data.reason}</p>;
  const v3 = (() => { try { return withNiceNames(data.v3); } catch { return data.v3; } })();
  const ids = Object.keys(v3.directionLabels).map(Number).sort((a, b) => a - b);
  const shown = dir != null && ids.includes(dir) ? dir : ids[0];
  return (
    <>
      <DirectionBar ids={ids} labels={v3.directionLabels} dir={shown} setDir={setDir} />
      <Canvas data={data} v3={v3} route={route} dir={shown} band={band} measure={measure} pick={pick} anchor={anchor} setPick={setPick} />
    </>
  );
}

/** The direction switch sits above the map, under the top bar, because its options belong to the picked route. */
function DirectionBar({ ids, labels, dir, setDir }: { ids: number[]; labels: Record<string, string>; dir: number; setDir: (d: number) => void }) {
  if (ids.length < 2) return null;
  return (
    <div className="flex items-center gap-2 border-b border-[var(--border-primary)] px-4 py-2">
      <Group label="Direction" value={String(dir)} onChange={v => setDir(Number(v))} options={ids.map(d => [String(d), labels[String(d)]] as const)} />
    </div>
  );
}

/** The Live planner: the picked route on the map, each segment coloured by the chosen measure; a panel for the picked segment or stop. State is in the address. */
export default function LiveToolPage() {
  const { agency = '' } = useParams();
  const state = useLiveAgency(FEATURES.liveReports ? agency : '');
  const [route, setRoute] = useState<string | null>(() => readParam('route'));
  const [dir, setDir] = useState<number | null>(() => { const d = readParam('dir'); return d != null && d !== '' && !Number.isNaN(Number(d)) ? Number(d) : null; });
  const [band, setBand] = useState<DashboardBand>(() => { const b = readParam('band'); return BANDS.some(([k]) => k === b) ? (b as DashboardBand) : 'all'; });
  const [measure, setMeasure] = useState<MapMeasure>(() => { const m = readParam('measure'); return MEASURES.some(([k]) => k === m) ? (m as MapMeasure) : 'late'; });
  const [anchor, setAnchor] = useState<[number, number] | null>(null);
  const setPick = (p: MapPick | null, at: [number, number] | null) => { setPickRaw(p); setAnchor(at); };
  const [pick, setPickRaw] = useState<MapPick | null>(() => {
    const stop = readParam('stop'), seg = readParam('seg');
    if (stop) return { kind: 'stop', stopId: stop };
    const [f, t] = (seg ?? '').split('>');
    return f && t ? { kind: 'segment', fromStopId: f, toStopId: t } : null;
  });
  const summary: AgencySummary | null = state.kind === 'done' && state.data.status === 'ready' ? state.data.summary : null;
  const top = useMemo(() => { if (!summary) return null; const o = orderRoutes(summary); return (o.worse[0] ?? o.rest[0])?.r.route ?? null; }, [summary]);
  const current = route ?? top;
  useEffect(() => {
    syncUrlParams({
      view: null, route, dir: dir == null ? null : String(dir), band: band === 'all' ? null : band, measure: measure === 'late' ? null : measure,
      stop: pick?.kind === 'stop' ? pick.stopId : null, seg: pick?.kind === 'segment' ? `${pick.fromStopId}>${pick.toStopId}` : null,
    });
  }, [route, dir, band, measure, pick]);
  useEffect(() => { applySeoToDocument(document, { title: liveReportTitle(agency.toUpperCase()), description: '', canonicalUrl: window.location.href, noindex: true, matchedPath: window.location.pathname }); }, [agency]);
  if (!FEATURES.liveReports) return <LiveOffNotice />;
  const shell = (body: ReactNode) => <main className="relative flex h-screen min-h-0 flex-col overflow-hidden bg-[var(--bg-app)] text-[var(--text-primary)]">{body}</main>;
  if (state.kind === 'loading') return shell(<p className="p-6 text-sm text-[var(--text-muted)]" aria-busy="true">Loading {agency.toUpperCase()}…</p>);
  if (state.kind === 'error') return shell(<p className="p-6 text-sm text-[var(--text-muted)]">{state.reason}</p>);
  if (state.data.status !== 'ready') return shell(<p className="p-6 text-sm text-[var(--text-muted)]">{state.data.status === 'no_analysis' ? devOnly(state.data.reason) : state.data.reason}</p>);
  const s = state.data.summary;
  return shell(
    <>
      <header className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-[var(--border-primary)] bg-[var(--bg-header)] px-4 py-2">
        <a href="/" aria-label="Atlas by Civic Minds"><AtlasBrand /></a>
        {current && <RoutePicker s={s} route={current} onPick={r => { setRoute(r); setPick(null, null); }} />}
        <Group label="Measure" value={measure} onChange={v => setMeasure(v as MapMeasure)} options={MEASURES} />
        <Group label="Time of day" value={band} onChange={v => setBand(v as DashboardBand)} options={BANDS} />
      </header>
      {current && <RouteCanvas agency={agency} route={current} dir={dir} setDir={d => { setDir(d); setPick(null, null); }} band={band} measure={measure} pick={pick} anchor={anchor} setPick={setPick} />}
    </>,
  );
}
