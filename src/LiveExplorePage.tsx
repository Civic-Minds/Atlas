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
import { useLiveDashboard, liveAgencyPath } from './hooks/useLiveDashboard';
import { devOnly, liveReportTitle } from './lib/liveReportData';
import { applySeoToDocument } from './lib/seoDom';
import { syncUrlParams } from './utils/syncUrlParams';
import { LIVE_ROUTE_URL, currentSearch, linkUpdate, readLink } from './utils/urlSchema';
import { stretchLabel } from './utils/stopLabel';
import Card from './components/ui/Card';
import ErrorBoundary from './components/ErrorBoundary';
import PageShell from './components/ui/PageShell';
import EmptyPage from './components/ui/EmptyPage';
import PillGroup, { PILL_ROW } from './components/ui/PillGroup';
import ArrowLink from './components/ui/ArrowLink';
import LiveBackLink from './components/Live/LiveBackLink';
import { SubsectionTitle } from './components/ui/PageTitle';
import LiveOffNotice from './components/LiveOffNotice';
import type { RouteStripMode } from './components/Live/RouteStrip';
import DirectionStrip, { directionStopsById } from './components/Live/DirectionStrip';
import { delayText, type RouteStripStop } from './components/Live/routeStripModel';
import LiveDashboardView, { type DashboardPart } from './LiveDashboardView';
import { useLiveGaps } from './hooks/useLiveGaps';
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
import { BOUNDARY, FullAnalysisSections, type FullAnalysisPart, RouteReportHeader, withNiceNames } from './LiveRoutePage';
import { ALONG_ROUTE_TITLE, BOTH_DIRECTIONS_LABEL, BUNCHING_FORMS_TITLE, DELAY_LEGEND_TITLE, DELAY_STARTS_TITLE, DIRECTION_LABEL, EXTRA_WAIT_LABEL, GAPS_OFF_SCHEDULE_LABEL, GROWS_LABEL, LATE_BY_HOUR_TITLE, LATE_LABEL, LATE_STOPS_TITLE, LINKED_LABEL, LINKED_TO_TITLE, NOT_LINKED_LABEL, NOT_MEASURED_LABEL, NOT_MEASURED_VALUE, OPEN_LIVE_LABEL, SERVICE_DELIVERED_TITLE, TIME_OF_DAY_LABEL, TOO_CLOSE_LABEL, TOO_FAR_LABEL, TRIP_TIME_LABEL, TYPICAL_ADDED, METHOD_TITLE } from '../shared/liveWording';
import { LIVE_LESS_EXACT_HERE, LIVE_METHOD_DRAW_ERROR, LIVE_NOTHING_LINKED, loadingText, DAY_LABEL, FILTERS_LABEL } from './content/noticeCopy';
import { percentText, countText } from '../shared/numberText';
import { LIVE_PATH } from '../shared/pagePaths';
import ReportTopicTabs, { type ReportTopic } from './components/Live/ReportTopicTabs';

type Day = 'all' | 'weekday' | 'weekend';

/** The Full report's topics (CIV-284's grouping), shown one at a time as tabs (CIV-2156). */
type TopicKey = 'route' | 'lateHours' | 'lateStops' | 'tripTime' | 'delays' | 'wait' | 'bunching' | 'delivered' | 'method';
/**
 * CIV-2156: the topic holding each part a link or a picked stop jumps to (the strip, the Summary's "Every stop" #b2, an
 * old ?view=analysis#b1/#runtime), so the tab opens before the page scrolls to it.
 */
const ANCHOR_TOPIC: Readonly<Record<string, TopicKey>> = {
  'x-strip': 'route', 'x-late': 'lateHours', b1: 'lateHours', 'x-stops': 'lateStops', b2: 'lateStops', 'x-runtime': 'tripTime', runtime: 'tripTime',
};

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
  const bunch = bunchBand?.stops.find(x => x.stopId === s.stopId);
  const extra = v3.extraWait?.[band]?.find(x => x.directionId === sel.dir && x.stopId === s.stopId);
  const into = buildup?.stretches.find(x => x.toStopId === s.stopId);
  return (
    <Panel title={s.name} sub={strip.label}>
      <Block>
        {s.n > 0 && s.delayMin != null ? (
          <>
            <Fact label={DELAY_LEGEND_TITLE} value={delayText(s.delayMin)} />
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
    <Card as="aside" tone="surface" padding="tight" className="min-w-0 lg:sticky lg:top-4" aria-live="polite">
      <h3 className="text-lg font-black leading-tight">{title}</h3>
      <div className="mt-0.5 text-xs text-[var(--text-dim)]">{sub}</div>
      <div className="mt-3">{children}</div>
    </Card>
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
            <SubsectionTitle className="mb-1">{v3.directionLabels[String(d)]}</SubsectionTitle>
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
  const gaps = useLiveGaps(FEATURES.liveReports ? agency : null, route);
  const [link] = useState(() => readLink(currentSearch(), LIVE_ROUTE_URL));
  const [dir, setDir] = useState<number | null>(() => link.dir ?? null);
  const [day, setDay] = useState<Day>(() => link.day ?? 'all');
  const { agencies } = useAgencies();
  const [band, setBand] = useState<DashboardBand>(() => link.band ?? liveBandNow(agencies.find(a => a.slug === agency)?.timezone));
  const [picked, setPicked] = useState<Selection | null>(null);
  // CIV-2156: the topic tab showing, and a part to scroll to once its tab has drawn.
  const [openTopic, setOpenTopic] = useState<TopicKey>(() => ANCHOR_TOPIC[window.location.hash.slice(1)] ?? 'route');
  const [jump, setJump] = useState<{ id: string; smooth: boolean } | null>(null);
  const jumpTo = (id: string, smooth = true) => {
    const topic = ANCHOR_TOPIC[id];
    if (topic) setOpenTopic(topic);
    setJump({ id, smooth });
  };
  useEffect(() => {
    if (!jump) return;
    document.getElementById(jump.id)?.scrollIntoView(jump.smooth ? { behavior: 'smooth', block: 'start' } : undefined);
    setJump(null);
  }, [jump, openTopic]);
  useEffect(() => { syncUrlParams(linkUpdate(LIVE_ROUTE_URL, { view: 'explore', dir, day, band })); }, [dir, day, band]);
  // A link to a part of the page (the Summary's "Every stop", an old ?view=analysis#b2) lands on it once the page has drawn.
  useEffect(() => {
    if (state.kind !== 'done' || !window.location.hash) return;
    jumpTo(window.location.hash.slice(1), false);
  }, [state.kind]);
  const routeTitle = state.kind === 'done' && state.data.status === 'ready' ? state.data.routeTitle : null;
  useEffect(() => {
    if (!agency || !route) return;
    applySeoToDocument(document, { title: liveReportTitle(routeTitle || `${agencyName} ${route}`, true), description: '', canonicalUrl: `${ATLAS_MODE === 'public' ? SITE_URL : window.location.origin}${window.location.pathname}`, noindex: true, matchedPath: window.location.pathname });
  }, [agencyName, route, routeTitle]);
  if (!FEATURES.liveReports) return <LiveOffNotice report />;
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
    jumpTo('x-strip');
  };

  // The Dashboard's and Full analysis's parts, one at a time (CIV-284).
  const dash = (part: DashboardPart) => (
    <LiveDashboardView v3={v3} data={v3.bands.all} band="all" dir={dir} uncertain={uncertain} filters={null} part={part}
      toFull={hash => jumpTo(hash)} />
  );
  const full = (part: FullAnalysisPart) => (
    <div data-full-analysis><FullAnalysisSections v3={v3} dir={dir} uncertain={uncertain} gaps={gaps} agency={agency} route={route} part={part} /></div>
  );

  // The report's topics, in order, each with every part it had (CIV-284's grouping), one at a time as tabs (CIV-2156).
  const topics: ReportTopic<TopicKey>[] = [
    { key: 'route', title: ALONG_ROUTE_TITLE, body: <>
      <ErrorBoundary label={BOUNDARY(ALONG_ROUTE_TITLE)}>
        <Main v3={v3} band={band} dir={dir} uncertain={uncertain} sel={sel} setSel={setPicked} />
      </ErrorBoundary>
      {dash('strip')}
    </> },
    { key: 'lateHours', title: LATE_BY_HOUR_TITLE, body: <>
      <LateByHourSection chart="bars" id="x-late" shrink title={LATE_BY_HOUR_TITLE} v3={v3} data={bandData} band={band} dir={dir} day={day} boundary={BOUNDARY(LATE_BY_HOUR_TITLE)}
        before={<div className="mt-3"><Group label={DAY_LABEL} value={day} onChange={v => setDay(v as Day)} options={DAYS} /></div>} />
      {dash('lateHours')}
      {full('lateHours')}
    </> },
    { key: 'lateStops', title: LATE_STOPS_TITLE, body: <>
      <WorstStopsSection v3={v3} data={bandData} dir={dir} uncertain={uncertain} limit={10} columns="full" title={LATE_STOPS_TITLE} id="x-stops" shrink boundary={BOUNDARY(LATE_STOPS_TITLE)} onPick={pickStop} canPick={onStrip} />
      {/* CIV-2128 pick 4a: the Dashboard's five stops were the top 5 of Explore's table; the table and the map stay. */}
      {full('lateStops')}
    </> },
    { key: 'tripTime', title: TRIP_TIME_LABEL, body: <>
      <RunTimeSection v3={v3} band={band} dir={dir} detail="compact" id="x-runtime" shrink boundary={BOUNDARY(TRIP_TIME_LABEL)} />
      {dash('tripTime')}
      {full('tripTime')}
    </> },
    { key: 'delays', title: DELAY_STARTS_TITLE, body: <>
      <BuildupSection v3={v3} data={bandData} dir={dir} uncertain={uncertain} detail="compact" boundary={BOUNDARY(DELAY_STARTS_TITLE)} />
      {full('delays')}
    </> },
    { key: 'wait', title: EXTRA_WAIT_LABEL, body: <>
      <ExtraWaitSection v3={v3} band={band} dir={dir} detail="compact" boundary={BOUNDARY(EXTRA_WAIT_LABEL)} />
      {full('wait')}
    </> },
    { key: 'bunching', title: BUNCHING_FORMS_TITLE, body: <>
      <BunchingSection v3={v3} dir={dir} band={band} detail="compact" boundary={BOUNDARY(BUNCHING_FORMS_TITLE)} />
      {full('bunching')}
    </> },
    { key: 'delivered', title: SERVICE_DELIVERED_TITLE, body: <>
      <DeliveredSection v3={v3} dir={dir} detail="compact" boundary={BOUNDARY(SERVICE_DELIVERED_TITLE)} />
      {full('delivered')}
    </> },
    // How this is measured: one copy, Explore's (CIV-2128 pick 10a; the three were the same block).
    { key: 'method', title: METHOD_TITLE, body: <ErrorBoundary label={LIVE_METHOD_DRAW_ERROR}><MethodSection scope="route" data={data} /></ErrorBoundary> },
  ];

  return shell(
    <article className="pb-16 pt-10 sm:pt-14">
      <RouteReportHeader toAgency={toAgency} data={data} v3={v3} agency={agency} route={route} title={title} />

      {/* CIV-284 (Ryan: "For that Live Report does a worker want to group all similar information on that page into sections?"):
          the Full report's own parts, the Dashboard's (dash) and Full analysis's (full, data-full-analysis) set side by side by
          what they show, each exactly as it was. The Dashboard's and Full analysis's parts are the whole day; the Direction
          pick applies to all. De-duplication is a later item. */}
      {/* The week. CIV-2128 (Ryan: "Honestly you decide but don't remove any graphics/interactives yet", pick 1a): Full
          analysis's week comparison, the only copy with a heading, then the Dashboard's note on the Direction pick just above
          the pick. Explore's and the Dashboard's copies of the same tiles are gone. */}
      {full('week')}
      {dash('weekNote')}

      <div className={`mt-6 ${PILL_ROW}`} role="group" aria-label={FILTERS_LABEL}>
        <Group label={DIRECTION_LABEL} value={dir == null ? 'both' : String(dir)} onChange={v => setDir(v === 'both' ? null : Number(v))}
          options={[['both', BOTH_DIRECTIONS_LABEL], ...dirsOf(v3, null).map(d => [String(d), v3.directionLabels[String(d)]] as const)]} />
        <Group label={TIME_OF_DAY_LABEL} value={band} onChange={v => setBand(v as DashboardBand)} options={PERIOD_BANDS_ONLY} />
      </div>

      <ReportTopicTabs topics={topics} open={openTopic} setOpen={setOpenTopic} label={routeTitle || title} />
    </article>,
  );
}
