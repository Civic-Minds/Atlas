import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useParams } from 'react-router';
import { useLiveAgencyName } from './hooks/useLiveAgencyName';
import { ATLAS_MODE, FEATURES } from '../shared/config';
import {
  LINK_LABELS, linkValueText,
  type DashboardBand, type DashboardBandData, type LiveV3, type UncertainStart,
} from '../shared/liveDashboard';
import { scheduledEveryText } from '../shared/headwayText';
import { minutesText } from '../shared/liveFormat';
import { SITE_URL } from '../shared/seo';
import { useLiveDashboard, liveAgencyPath, liveToolPath } from './hooks/useLiveDashboard';
import { devOnly, liveReportTitle, liveRouteTitleLabel } from './lib/liveReportData';
import { RouteTitleName } from './components/RouteRowName';
import { applySeoToDocument } from './lib/seoDom';
import { syncUrlParams } from './utils/syncUrlParams';
import { LIVE_ROUTE_URL, currentSearch, linkUpdate, readLink } from './utils/urlSchema';
import { stretchLabel } from './utils/stopLabel';
import { TILE } from './pageStyles';
import ErrorBoundary from './components/ErrorBoundary';
import PageShell from './components/ui/PageShell';
import EmptyPage from './components/ui/EmptyPage';
import PillGroup, { PILL_ROW } from './components/ui/PillGroup';
import ArrowLink from './components/ui/ArrowLink';
import LiveBackLink from './components/Live/LiveBackLink';
import { PageTitle } from './components/ui/PageTitle';
import LiveOffNotice from './components/LiveOffNotice';
import type { RouteStripMode } from './components/Live/RouteStrip';
import DirectionStrip, { directionStopsById } from './components/Live/DirectionStrip';
import { delayText, type RouteStripStop } from './components/Live/routeStripModel';
import { KpiRow } from './LiveDashboardView';
import WorstStopsSection from './components/Live/sections/WorstStopsSection';
import RunTimeSection from './components/Live/sections/RunTimeSection';
import LateByHourSection from './components/Live/sections/LateByHourSection';
import MethodSection from './components/Live/sections/MethodSection';
import DeliveredSection from './components/Live/sections/DeliveredSection';
import ExtraWaitSection from './components/Live/sections/ExtraWaitSection';
import BunchingSection from './components/Live/sections/BunchingSection';
import BuildupSection from './components/Live/sections/BuildupSection';
import { PERIOD_BANDS_ONLY, DAYS, dirsOf, mins } from './components/Live/sections/figures';
import { liveBandNow } from './components/Live/liveBandNow';
import { useAgencies } from './hooks/useAgencies';
import { BOUNDARY, RouteDevHint, RouteSubtitle, withNiceNames } from './LiveRoutePage';
import { ALONG_ROUTE_TITLE, BOTH_DIRECTIONS_LABEL, BUNCHING_FORMS_TITLE, DELAY_LEGEND_TITLE, DELAY_STARTS_TITLE, DIRECTION_LABEL, EXTRA_WAIT_LABEL, GAPS_OFF_SCHEDULE_LABEL, GROWS_LABEL, LATE_BY_HOUR_TITLE, LATE_LABEL, LATE_STOPS_TITLE, LINKED_LABEL, LINKED_TO_TITLE, NOT_LINKED_LABEL, NOT_MEASURED_LABEL, NOT_MEASURED_VALUE, OPEN_LIVE_LABEL, P90_LATER_LABEL, SERVICE_DELIVERED_TITLE, TIME_OF_DAY_LABEL, TOO_CLOSE_LABEL, TOO_FAR_LABEL, TRIP_TIME_LABEL, TYPICAL_ADDED, VIEW_ON_LIVE_MAP, WEEK_COMPARE_TITLE } from '../shared/liveWording';
import { LIVE_LESS_EXACT_HERE, LIVE_METHOD_DRAW_ERROR, LIVE_NOTHING_LINKED, loadingText } from './content/noticeCopy';
import { percentText, countText } from '../shared/numberText';
import { LIVE_PATH } from '../shared/pagePaths';

type Day = 'all' | 'weekday' | 'weekend';

/** What is open in the detail panel: a stop (by its place in the direction's strip) or a marked stretch. */
type Selection = { dir: number; kind: 'stop'; stopId: string } | { dir: number; kind: 'stretch'; mode: RouteStripMode };


const Group = PillGroup;

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

  if (sel.kind === 'stretch') {
    if (sel.mode === 'delay') {
      const f = buildup?.forms;
      if (!f) return null;
      return (
        <Panel title={stretchLabel(f.fromName, f.toName)} sub={strip.label}>
          <Block>
            <Fact label={TYPICAL_ADDED} value={mins(f.medianAddedMin)} />
            <Fact label={GROWS_LABEL} value={percentText(f.growShare)} sub={`of ${countText(f.n)}`} />
            <Fact label={DELAY_LEGEND_TITLE} value={mins(f.medianDelayMin)} />
            <Fact label={P90_LATER_LABEL} value={mins(f.p90DelayMin)} />
          </Block>
        </Panel>
      );
    }
    const b = bunchBand?.forms;
    if (!b) return null;
    const linked = b.links.filter(l => l.linked);
    return (
      <Panel title={stretchLabel(b.fromName, b.toName)} sub={strip.label}>
        <Block>
          <Fact label={GAPS_OFF_SCHEDULE_LABEL} value={`${percentText(b.fromBadShare)} to ${percentText(b.toBadShare)}`} />
        </Block>
        <Block title={linked.length ? LINKED_TO_TITLE : LIVE_NOTHING_LINKED}>
          {b.links.map(l => (
            <Fact key={l.kind} label={`${l.value == null ? NOT_MEASURED_LABEL : l.linked ? LINKED_LABEL : NOT_LINKED_LABEL}: ${LINK_LABELS[l.kind]}`} value={l.value == null ? '' : linkValueText(l.kind, l.value)} />
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
            <Fact label={DELAY_LEGEND_TITLE} value={delayText(s.delayMin)} />
            {full && <Fact label={P90_LATER_LABEL} value={mins(full.p90Min)} />}
            {s.lateShare != null && <Fact label={LATE_LABEL} value={percentText(s.lateShare)} sub={`of ${countText(s.n)} departures`} />}
          </>
        ) : <Fact label={DELAY_LEGEND_TITLE} value={NOT_MEASURED_VALUE} />}
        {s.uncertain && <p className="mt-2 text-xs text-[var(--text-dim)]">{LIVE_LESS_EXACT_HERE}</p>}
      </Block>
      {bunch && bunch.n > 0 && (
        <Block>
          <Fact label={TOO_CLOSE_LABEL} value={percentText(bunch.bunchedShare)} />
          <Fact label={TOO_FAR_LABEL} value={percentText(bunch.gappedShare)} sub={`${countText(bunch.n)} gaps`} />
        </Block>
      )}
      {extra && (
        <Block>
          <Fact label={EXTRA_WAIT_LABEL} value={minutesText(Math.max(0, extra.extraWaitMin))} sub={scheduledEveryText(extra.scheduledGapMin)} />
        </Block>
      )}
      {into && into.n > 0 && (
        <Block title={stretchLabel(into.fromName, into.toName)}>
          <Fact label={TYPICAL_ADDED} value={mins(into.medianAddedMin)} />
          <Fact label={GROWS_LABEL} value={percentText(into.growShare)} sub={`of ${countText(into.n)}`} />
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

export default function LiveExplorePage() {
  const { agency = '', route = '' } = useParams();
  const agencyName = useLiveAgencyName(agency);
  const state = useLiveDashboard(FEATURES.liveReports ? agency : null, route);
  const [link] = useState(() => readLink(currentSearch(), LIVE_ROUTE_URL));
  const [dir, setDir] = useState<number | null>(() => link.dir ?? null);
  const [day, setDay] = useState<Day>(() => link.day ?? 'all');
  const { agencies } = useAgencies();
  const [band, setBand] = useState<DashboardBand>(() => link.band ?? liveBandNow(agencies.find(a => a.slug === agency)?.timezone));
  const [picked, setPicked] = useState<Selection | null>(null);
  useEffect(() => { syncUrlParams(linkUpdate(LIVE_ROUTE_URL, { view: 'explore', dir, day, band })); }, [dir, day, band]);
  const routeTitle = state.kind === 'done' && state.data.status === 'ready' ? state.data.routeTitle : null;
  useEffect(() => {
    if (!agency || !route) return;
    applySeoToDocument(document, { title: liveReportTitle(routeTitle || `${agencyName} ${route}`), description: '', canonicalUrl: `${ATLAS_MODE === 'public' ? SITE_URL : window.location.origin}${window.location.pathname}`, noindex: true, matchedPath: window.location.pathname });
  }, [agencyName, route, routeTitle]);
  if (!FEATURES.liveReports) return <LiveOffNotice />;
  const title = `${agencyName} ${route}`;
  const back = FEATURES.live ? <ArrowLink href={LIVE_PATH}>{OPEN_LIVE_LABEL}</ArrowLink> : null;
  // CIV-1446: every route page, loaded or not (a route held back, an unknown route), leads back to the agency's page.
  const toAgency = <LiveBackLink agencyName={agencyName} href={liveAgencyPath(agency)} />;
  const shell = (body: ReactNode) => <PageShell variant="wide" maxWidth="max-w-[1600px]">{body}</PageShell>;
  if (state.kind === 'loading') return shell(<><div className="mt-24">{toAgency}</div><p className="mt-2 text-sm text-[var(--text-muted)]" aria-busy="true">{loadingText(title)}</p></>);
  if (state.kind === 'error') return <EmptyPage title={title} body={state.reason} action={back} above={toAgency} maxWidth="max-w-[1600px]" />;
  const data = state.data;
  if (data.status !== 'ready') {
    return <EmptyPage title={title} body={data.status === 'no_analysis' ? devOnly(data.reason) : data.reason} action={back} above={toAgency} maxWidth="max-w-[1600px]" />;
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
      <div className="mb-2">{toAgency}</div>
      <div className="flex flex-col gap-1 sm:grid sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-x-4">
        <div className="min-w-0"><PageTitle>{data.routeTitle ? <RouteTitleName label={liveRouteTitleLabel(data.routeTitle, route)} /> : title}</PageTitle></div>
        <p className="m-0 text-sm text-[var(--text-muted)] sm:col-span-2 sm:row-start-2">
          <RouteSubtitle v3={v3} agency={agency} route={route} />
        </p>
        {FEATURES.liveReports && <ArrowLink href={liveToolPath(agency, route)} className="mt-3 shrink-0 whitespace-nowrap sm:col-start-2 sm:row-start-1 sm:mt-0">{VIEW_ON_LIVE_MAP}</ArrowLink>}
      </div>
      <RouteDevHint v3={v3} route={route} />
      {data.note && <p className="mt-4 max-w-3xl text-sm font-bold text-[var(--status-caution-text)]">{data.note}</p>}

      <ErrorBoundary label={BOUNDARY(WEEK_COMPARE_TITLE)}><KpiRow v3={v3} /></ErrorBoundary>

      <div className={`mt-6 ${PILL_ROW}`} role="group" aria-label="Filters">
        <Group label={DIRECTION_LABEL} value={dir == null ? 'both' : String(dir)} onChange={v => setDir(v === 'both' ? null : Number(v))}
          options={[['both', BOTH_DIRECTIONS_LABEL], ...dirsOf(v3, null).map(d => [String(d), v3.directionLabels[String(d)]] as const)]} />
        <Group label={TIME_OF_DAY_LABEL} value={band} onChange={v => setBand(v as DashboardBand)} options={PERIOD_BANDS_ONLY} />
      </div>

      <ErrorBoundary label={BOUNDARY(ALONG_ROUTE_TITLE)}>
        <Main v3={v3} band={band} dir={dir} uncertain={uncertain} sel={sel} setSel={setPicked} />
      </ErrorBoundary>

      <LateByHourSection chart="bars" id="x-late" shrink title={LATE_BY_HOUR_TITLE} v3={v3} data={bandData} band={band} dir={dir} day={day} boundary={BOUNDARY(LATE_BY_HOUR_TITLE)}
        before={<div className="mt-3"><Group label="Day" value={day} onChange={v => setDay(v as Day)} options={DAYS} /></div>} />
      <RunTimeSection v3={v3} band={band} dir={dir} detail="compact" id="x-runtime" shrink boundary={BOUNDARY(TRIP_TIME_LABEL)} />
      <BuildupSection v3={v3} data={bandData} dir={dir} uncertain={uncertain} detail="compact" boundary={BOUNDARY(DELAY_STARTS_TITLE)} />
      <ExtraWaitSection v3={v3} band={band} dir={dir} detail="compact" boundary={BOUNDARY(EXTRA_WAIT_LABEL)} />
      <BunchingSection v3={v3} dir={dir} band={band} detail="compact" boundary={BOUNDARY(BUNCHING_FORMS_TITLE)} />
      <DeliveredSection v3={v3} dir={dir} detail="compact" boundary={BOUNDARY(SERVICE_DELIVERED_TITLE)} />
      <WorstStopsSection v3={v3} data={bandData} dir={dir} uncertain={uncertain} limit={10} columns="full" title={LATE_STOPS_TITLE} id="x-stops" shrink boundary={BOUNDARY(LATE_STOPS_TITLE)} onPick={pickStop} canPick={onStrip} />
      <ErrorBoundary label={LIVE_METHOD_DRAW_ERROR}><MethodSection scope="route" data={data} /></ErrorBoundary>
    </article>,
  );
}
