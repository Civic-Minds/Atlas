import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react';
import { CardDirectionRow, CardHelpNotice, CardSectionLabel, SidebarCardSection } from '../Interval/cardUi';
import { countOf } from '../../../shared/overflowText';
import { useSegmentDelayStatus } from '../../hooks/useSegmentDelay';
import { liveCloudFetch } from '../../lib/liveCloudFetch';
import { periodKeyForHour } from '../../../shared/config';
import { LIVE_AGENCY_TIMEZONES } from '../../../shared/livePollingConfig';
import { localHour } from '../../../shared/liveAgencyConfig';
import { clockTime } from '../../../shared/timeText';
import { type SegmentBand, type SegmentDelayData } from '../../utils/segmentDelayView';
import { headwayEvery, headwayEveryRange } from '../../../shared/headwayText';
import type { LiveScheduledRow } from '../../utils/liveScheduledHeadway';
import { branchOnlyStops, vehiclesByPattern } from '../../../shared/livePatterns';
import { gapText } from '../../../shared/liveFormat';
import { useRouteAnalysis } from '../../hooks/useRouteAnalysisPatterns';
import { addSnapshot, gapExtremes, lineModel, liveGaps, liveTripDirections, positionsSnapshot, rowLineModel, type RecentSnapshot, withStats, type LineModel } from '../../utils/livePerformance';
import type { LiveVehicle } from '../../context/LiveVehiclesMapOverlay';
import { vehicleStatus } from '../../utils/colors';
import { LIVE_FEED_INCOMPLETE, LIVE_ROUTE_FIGURES_UNAVAILABLE, LOADING_LABEL, LIVE_UNMATCHED_DESTINATION, RIGHT_NOW_LABEL, VEHICLES_LABEL, SCHEDULED_COLUMN } from '../../content/noticeCopy';
import { LIVE_SHARED_GAP_KEY, LONGEST_GAP_LABEL, ON_TIME_LABEL, SHORTEST_GAP_LABEL, type LiveRowGap } from '../../../shared/liveWording';
import { liveOrScheduleProps } from '../../utils/liveRowValue';
import { median } from '../../../shared/segmentDelay';
import { rowDirectionKey } from '../../utils/liveGrouping';
import { LIVE_RECENT_REFRESH_SEC, LIVE_STALE_SEC, RIGHT_NOW_STALE_SEC } from '../../../shared/rules/live';

/** Seconds to minutes at the shared format's precision (a tenth), so two ends that print the same read as one value. */
const tenthMin = (sec: number): number => Math.round(sec / 6) / 10;

/**
 * The schedule's gap as the map writes a frequency: "every 8 min", or "every 8–14 min" when the period mixes headways
 * (shared/headwayText.ts; Ryan, CIV-1160 question 5, 2026-11-13).
 */
export function schedText(st: { scheduledMedianGapSec: number; scheduledP10Sec?: number; scheduledP90Sec?: number }): string {
  const lo = st.scheduledP10Sec, hi = st.scheduledP90Sec;
  if (lo == null || hi == null || tenthMin(lo) === tenthMin(hi)) return headwayEvery(tenthMin(st.scheduledMedianGapSec));
  return headwayEveryRange(tenthMin(lo), tenthMin(hi));
}

const AMBER = 'var(--status-caution-text)';

/** The agency's hour (LIVE_AGENCY_TIMEZONES); the browser's clock when the agency has no zone listed. */
export function agencyHour(slug: string, d = new Date()): number {
  return localHour(d.getTime(), LIVE_AGENCY_TIMEZONES[slug]);
}

/** "Right now" names a time only once the vehicles' newest report is older than this: "Right now · last updated 2:04 PM" (CIV-1034). */
export { RIGHT_NOW_STALE_SEC };

/** "11:42 PM" on the agency's clock (shared/timeText.ts). */
export function agencyTime(slug: string, d = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { hour: 'numeric', minute: 'numeric', hourCycle: 'h23', timeZone: LIVE_AGENCY_TIMEZONES[slug] }).formatToParts(d);
  const n = (t: string) => Number(parts.find(x => x.type === t)?.value ?? 0);
  return clockTime(n('hour') * 60 + n('minute'));
}

/**
 * The period at `hour` when the archive has figures for it; null when no period covers it (late night, overnight). Then
 * "Right now" shows no scheduled comparison: the whole day's timetable is never shown as the hour's (CIV-1459 rule).
 */
export function livePeriodAt(data: Pick<SegmentDelayData, 'headways'>, hour: number): SegmentBand | null {
  const key = periodKeyForHour(hour);
  return key && (data.headways ?? []).some(h => h.bands[key as SegmentBand]) ? (key as SegmentBand) : null;
}

/**
 * A row of small labelled figures. Labels wrap rather than cut off on a narrow card; labels
 * share the first grid row and figures the second, so the figures stay level when one label takes two lines.
 */
function Stats({ items }: { items: [string, string, /** A colour for the figure (amber when a gap breaks the rule). */ string?][] }) {
  return (
    <div className="grid grid-cols-3 grid-rows-[auto_auto] grid-flow-col gap-x-2">
      {items.map(([label, value, color]) => (
        <Fragment key={label}>
          <div className="min-w-0 self-end text-xs font-bold text-[var(--text-dim)] leading-snug break-words">{label}</div>
          <div style={color ? { color } : undefined} className={`min-w-0 text-sm font-black whitespace-nowrap${color ? '' : ' text-[var(--text-primary)]'}`}>{value}</div>
        </Fragment>
      ))}
    </div>
  );
}

/**
 * One card row's live figures (CIV-2047): its vehicles, then its longest and shortest gap, each on its own line (Ryan's
 * CIV-2045 layout); amber when a gap breaks the shared too-far / too-close rule. The figures are kept apart from the
 * layout, so the compact one-line form can be shown instead for Ryan's review.
 */
interface Props {
  /** CIV-2045: the main map card's own Scheduled lines for the picked direction (liveScheduledRows); none shows nothing. */
  scheduledRows?: ReadonlyArray<LiveScheduledRow> | null;
  /** Main Live (CIV-2901 v3): each direction's own destination rows (liveScheduledRowsNow), so every direction shows at once. */
  scheduledRowsFor?: (directionId: number, label: string) => ReadonlyArray<LiveScheduledRow> | null;
  /** "Right now · last updated 2:04 PM" once the reports are stale (CIV-1034); main Live's card passes false, its clock
   *  beside the flag says it (CIV-3047 B). */
  staleInHeading?: boolean;
  slug: string;
  routeShortName: string;
  /** The route's vehicles as the map shows them (every poll); "Right now" is built from these. */
  vehicles: readonly LiveVehicle[];
  /** Live feed is down, stale or incomplete: "Right now" is hidden. */
  feedDegraded: boolean;
  /**
   * Studio: the picked direction and the vehicles "Right now" counts in it (#1163); null while "Right now" has no count
   * (no analysis, feed down or incomplete). Must be stable (a state setter).
   */
  onCounted?: (counted: { directionId: number; label: string; ids: string[] } | null) => void;
  /**
   * Studio's Live route panel (CIV-2021): the panel's own Direction chip picks the card's one direction. Left out, every
   * direction shows, one under another (main Live, CIV-2901 v3).
   */
  direction?: number | null;
  /**
   * CIV-2021 (Ryan: "I'm confused what I am looking at here if live information is unavailable"): the line shown when the
   * route has no live analysis. Studio says only the right-now reading is missing; left out, main Live's own line (CIV-1413).
   */
  unavailableMessage?: string;
  /**
   * #1750: load the route's reading even when Live mode is off. Studio's route panel sets it, as it polls the vehicles
   * itself (useLiveFeeds(true)); left out, Live mode decides (main Live, the map card).
   */
  liveEnabled?: boolean;
  /**
   * #1877 (Ryan: "I don't like how the Live vehicles is separate here from the regular destinations"): main Live's route
   * card shows each destination once, on its own row, with its vehicles and its gap. Given this, "Right now" draws nothing
   * and hands each direction's destination gaps (longest, in minutes, keyed as rowDirectionKey names the destination) to
   * the card instead. Must be stable (a state setter or useCallback).
   */
  onDestinationGaps?: (directionId: number, gaps: ReadonlyMap<string, LiveRowGap>) => void;
  /**
   * #1958: with onDestinationGaps, the vehicles each card row counts (mergeIntoCardRows), keyed as rowDirectionKey names
   * the destination. Each row's gaps are measured over exactly these, so a row showing vehicles also gets their gaps.
   */
  rowVehicles?: ReadonlyMap<string, readonly LiveVehicle[]>;
}

/**
 * The route's recent positions. CIV-3173 part 2 (one feed, one clock): the recorded last half hour (local-api live-recent,
 * route_now's reader), re-read every LIVE_RECENT_REFRESH_SEC, is the only source where it answers, so the map, Studio and
 * route_now measure the same recordings; its clock is the newest recording's time, the same wherever the card is open.
 * Without the recordings (no read token, a route not recorded) the map's polls build it up, as before, on the browser's
 * clock. `clockSec` is null then.
 */
export function useRecentPositions(vehicles: readonly LiveVehicle[], slug: string, routeShortName: string): { recent: RecentSnapshot[]; seedSettled: boolean; clockSec: number | null } {
  const [polls, setPolls] = useState<RecentSnapshot[]>([]);
  const [seed, setSeed] = useState<{ snapshots: RecentSnapshot[]; serverNow: number | null; fetchedAt: number } | null>(null);
  // #1833: whether the recorded half hour has come back (or failed). Until then a thin first poll is loading, not a failure.
  const [seedSettled, setSeedSettled] = useState(false);
  useEffect(() => {
    setPolls(b => addSnapshot(b, positionsSnapshot(vehicles, Math.floor(Date.now() / 1000))));
  }, [vehicles]);
  useEffect(() => {
    let live = true;
    setSeed(null);
    setSeedSettled(false);
    const read = () => Promise.resolve()
      .then(() => liveCloudFetch('recent', { agency: slug, route: routeShortName }))
      .then(r => (r.ok ? r.json() as Promise<{ now?: number; snapshots?: RecentSnapshot[] }> : null))
      .then(j => { if (live && j?.snapshots?.length) setSeed({ snapshots: j.snapshots, serverNow: j.now ?? null, fetchedAt: Date.now() }); })
      .catch(() => {})
      .finally(() => { if (live) setSeedSettled(true); });
    void read();
    const t = setInterval(() => void read(), LIVE_RECENT_REFRESH_SEC * 1000);
    return () => { live = false; clearInterval(t); };
  }, [slug, routeShortName]);
  const recent = useMemo(() => (seed ? seed.snapshots : polls), [seed, polls]);
  // The newest recording's time, unless the recordings have stopped coming (by the server's clock) or the last answer is
  // old (by the browser's): then the real time, so the card shows the reading as stale instead of frozen.
  const newest = seed ? Math.max(...seed.snapshots.map(s => s.capturedAt)) : null;
  const clockSec = seed && newest != null
    ? (seed.serverNow != null && seed.serverNow - newest > LIVE_STALE_SEC) || Date.now() - seed.fetchedAt > LIVE_STALE_SEC * 1000
      ? Math.floor(Date.now() / 1000)
      : newest
    : null;
  return { recent, seedSettled, clockSec };
}


/**
 * The Live route card's "Right now" (CIV-2901 v3, Ryan: "why are we not using the same code as in the regular app"): main
 * Live shows it inside the regular route card (RouteCardHeadway's own section slot), every direction one under another,
 * as the regular card lists them, with no toggle; the card's own destination rows already give the schedule. Studio's panel
 * (CIV-2021) steers it to one direction with its own Direction chip and keeps the Scheduled lines, having no route card.
 */
export default function LiveRoutePerformance({ slug, routeShortName, vehicles, feedDegraded, onCounted, scheduledRows, scheduledRowsFor, direction, unavailableMessage = LIVE_ROUTE_FIGURES_UNAVAILABLE, liveEnabled, onDestinationGaps, rowVehicles, staleInHeading = true }: Props) {
  const steered = direction !== undefined;
  const { data: loaded, settled } = useSegmentDelayStatus(slug, routeShortName, liveEnabled);
  const data = loaded as (SegmentDelayData & { tripDirections?: Record<string, string[]> }) | null;
  const directions = useMemo(() => Object.entries(data?.directionLabels ?? {}).map(([id, label]) => [Number(id), label] as const), [data]);
  const { recent, seedSettled, clockSec } = useRecentPositions(vehicles, slug, routeShortName);
  // Re-checked every 30 s, so a feed that stops updating shows as incomplete instead of frozen.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), LIVE_RECENT_REFRESH_SEC * 1000);
    return () => clearInterval(t);
  }, [recent]);
  // CIV-3173 part 2: the card measures on the recordings' own clock where it reads them, so the map and Studio agree.
  const clockMs = clockSec != null ? clockSec * 1000 : now;

  // CIV-2045 (Ryan: "1"), CIV-2901: Studio's Scheduled lines, the main map card's own destination rows in its own row
  // component, with its headway dot.
  const scheduledBlock = steered && scheduledRows && scheduledRows.length > 0 ? (
                <div className="space-y-1">
                  <CardSectionLabel className="mb-0">{SCHEDULED_COLUMN}</CardSectionLabel>
                  {scheduledRows.map(r => <CardDirectionRow key={r.key} {...scheduledRowProps(r)} />)}
                </div>
  ) : null;
  // Loaded and still missing: Live has no analysis for this route, so "Right now" can't show; one grey line says so (CIV-1413 B).
  // While it loads, nothing. #1796 (Ryan: "This says live vehicles arent available on this route but then shows me live vehicles
  // lol"): main Live's line shows only while the route has no live vehicle; with some, the card's vehicle list below is live.
  if (!data) {
    if (!settled || onDestinationGaps) return null;
    const note = steered || vehicles.length === 0 ? <CardHelpNotice message={unavailableMessage} /> : null;
    return note || scheduledBlock ? <div className="flex flex-col gap-3">{note}{scheduledBlock}</div> : null;
  }
  if (!directions.length) return null;

  // Fresh data needs no time; stale data says when it was last updated (by the newest vehicle report). On main Live's
  // route card the clock beside the flag says it instead (CIV-3047 B), so the heading stays "Right now" there.
  const newest = Math.max(0, ...vehicles.map(v => v.tsEpoch ?? 0));
  const rightNowLabel = staleInHeading && newest > 0 && now / 1000 - newest > RIGHT_NOW_STALE_SEC
    ? `${RIGHT_NOW_LABEL} · last updated ${agencyTime(slug, new Date(newest * 1000))}`
    : RIGHT_NOW_LABEL;
  if (feedDegraded) return null;

  const shown = steered
    ? [directions.find(([id]) => id === direction) ?? directions[0]]
    : directions;
  // #1877: the card's destination rows carry the figures, so nothing is drawn here.
  if (onDestinationGaps) {
    return (
      <>
        {shown.map(([id, label]) => (
          <DirectionRightNow key={id} data={data} directionId={id} directionLabel={label} heading={null} slug={slug} routeShortName={routeShortName}
            vehicles={vehicles} recent={recent} seedSettled={seedSettled} now={clockMs} scheduledRows={scheduledRowsFor?.(id, label) ?? null}
            scheduledBlock={null} onDestinationGaps={onDestinationGaps} rowVehicles={rowVehicles} />
        ))}
      </>
    );
  }
  return (
    // No "Right now" heading (Ryan, 2026-11-27: no separate Right now and Scheduled sections); it names only a stale reading.
    <SidebarCardSection label={rightNowLabel === RIGHT_NOW_LABEL ? undefined : rightNowLabel}>
      <div className="flex flex-col gap-3">
        {shown.map(([id, label]) => (
          <DirectionRightNow
            key={id}
            data={data}
            directionId={id}
            directionLabel={label}
            heading={steered ? null : label}
            slug={slug}
            routeShortName={routeShortName}
            vehicles={vehicles}
            recent={recent}
            seedSettled={seedSettled}
            now={clockMs}
            scheduledRows={steered ? scheduledRows : scheduledRowsFor?.(id, label) ?? null}
            scheduledBlock={scheduledBlock}
            onCounted={steered ? onCounted : undefined}
          />
        ))}
      </div>
    </SidebarCardSection>
  );
}

/** A scheduled row as the main card draws it: its label, its headway dot and words (CIV-2045). */
function scheduledRowProps(r: LiveScheduledRow) {
  // The row's own number, else the one its words name ("every 10 min" on a row with no gap of its own).
  const every = r.headwayMin ?? (Number(/^every (\d+)/.exec(r.value)?.[1]) || null);
  return {
    labelWeight: r.key === 'shared' ? 'bold' as const : 'regular' as const,
    label: r.label,
    headway: every ?? undefined,
    headwayLabel: every != null && r.value !== headwayEvery(every) ? r.value : undefined,
    limited: every == null,
    limitedLabel: every == null ? r.value : undefined,
    wrapLongValue: true,
  };
}

/** One direction's "Right now": its vehicles by destination row, each with its longest gap (CIV-2047). */
function DirectionRightNow({ data, directionId, directionLabel, heading, slug, routeShortName, vehicles, recent, seedSettled, now, scheduledRows, scheduledBlock, onCounted, onDestinationGaps, rowVehicles }: {
  data: SegmentDelayData & { tripDirections?: Record<string, string[]> };
  directionId: number;
  directionLabel: string;
  /** The direction's name over its rows, as the regular card heads each direction; none when only one is shown. */
  heading: string | null;
  slug: string;
  routeShortName: string;
  vehicles: readonly LiveVehicle[];
  recent: RecentSnapshot[];
  /** #1833: the recorded half hour has come back (or failed). */
  seedSettled: boolean;
  now: number;
  scheduledRows: ReadonlyArray<LiveScheduledRow> | null | undefined;
  scheduledBlock: ReactNode;
  onCounted?: Props['onCounted'];
  /** #1877: report the destinations' gaps and draw nothing (see Props). */
  onDestinationGaps?: Props['onDestinationGaps'];
  rowVehicles?: Props['rowVehicles'];
}) {
  const line: LineModel | null = useMemo(() => lineModel(data, directionId), [data, directionId]);
  // From the map's own polls, not the archive, over the whole route (CIV-899). A trip the timetable
  // doesn't list is placed by its own movement since the card opened; until it has been seen twice it
  // is skipped (skipUnseenAdded). With 0 or 1 car the count still shows (no gaps line).
  // Trips today's timetable runs that the analysis's doesn't list get their direction from the map's.
  const period = livePeriodAt(data, agencyHour(slug));
  // The cars and their gaps need a band's stops either way; only the scheduled comparison waits for a period.
  const liveBand: SegmentBand = period ?? 'all';
  const extraTrips = liveTripDirections(vehicles, data.tripDirections).get(directionId);
  const live = line ? liveGaps(data, line, withStats(line, liveBand), liveBand, recent, Math.floor(now / 1000), { skipUnseenAdded: true, countFewCars: true, wholeLine: true, extraTrips }) : null;
  const countedKey = live && !live.incomplete ? (live.carIds ?? []).join('\n') : null;
  useEffect(() => {
    onCounted?.(countedKey == null ? null : { directionId, label: directionLabel, ids: countedKey ? countedKey.split('\n') : [] });
  }, [onCounted, countedKey, directionId, directionLabel]);
  useEffect(() => () => onCounted?.(null), [onCounted]);

  // CIV-2047: the counted cars by the card row they run, and each row's own gaps: the same live-gap calculation on that
  // row's cars only, judged against the row's own scheduled gap. The shared stretch takes every car. #1958: where the card
  // hands its rows' vehicles (rowVehicles), a row is measured over the vehicles it counts; the service-pattern grouping
  // found none on a route whose analysis has one pattern per direction (TTC 504), so rows with 8 vehicles had no live line.
  const stopPatterns = useRouteAnalysis(slug, routeShortName, !!scheduledRows?.length).value?.stopPatterns;
  const rowFigures = useMemo(() => {
    if (!live || live.incomplete || !scheduledRows?.length || !line) return null;
    const ids0 = new Set(live.carIds ?? []);
    const cars = vehicles.filter(v => ids0.has(v.id));
    const only = branchOnlyStops(stopPatterns?.[String(directionId)] ?? [], scheduledRows);
    const groups = vehiclesByPattern(cars, only);
    const out = new Map<string, { cars: number; extremes: ReturnType<typeof gapExtremes>; median: number | null }>();
    // A direction with one destination row: that row carries every car (Studio 512 westbound showed a bare "Vehicles 3").
    const destRows = scheduledRows.filter(r => r.key !== 'shared');
    const sole = destRows.length === 1 ? destRows[0].key : null;
    for (const r of scheduledRows) {
      const all = r.key === 'shared' || r.key === sole;
      const counted = rowVehicles ? rowDirectionKey(r.headsign, routeShortName) : null;
      const mine = all ? cars : counted ? rowVehicles!.get(counted) ?? [] : groups.get(r.key) ?? [];
      if (!all && !counted && !only.has(r.key)) continue;
      // As main measures it: the shared stretch and a direction's only row over every car, other rows over their own
      // cars, all along the direction's line.
      const ids = new Set(mine.map(v => v.id));
      const onLine = all ? live : liveGaps(data, line, withStats(line, liveBand), liveBand, recent.map(sn => ({ ...sn, v: sn.v.filter(e => ids.has(e[0])) })), Math.floor(now / 1000), { skipUnseenAdded: true, countFewCars: true, wholeLine: true, extraTrips, rowSubset: true });
      const reading = (g: typeof onLine) => (g && !g.incomplete ? gapExtremes({ gapsMin: g.gapsMin, scheduledSec: r.headwayMin != null ? r.headwayMin * 60 : g.scheduledSec }) : null);
      let sub = onLine;
      let ext = reading(onLine);
      // #1958: only where that gives no reading, a second look. A destination row is measured along its own shape, so
      // cars on a branch past the split or on other streets (TTC 504C) are on its line; the shared stretch over the cars
      // on the direction's line only (one off every recorded street isn't on the shared stretch). A row that already
      // reads live keeps exactly main's figure.
      if (!ext) {
        const own = !all && r.coordinates ? rowLineModel(directionId, r.coordinates) : null;
        const off = new Set(all ? live.offCarIds ?? [] : []);
        if (own || off.size) {
          const keep = new Set([...ids].filter(id => !off.has(id)));
          const alt = liveGaps(data, own ?? line, own ? [] : withStats(line, liveBand), liveBand, recent.map(sn => ({ ...sn, v: sn.v.filter(e => keep.has(e[0])) })), Math.floor(now / 1000), { skipUnseenAdded: true, countFewCars: true, wholeLine: true, extraTrips, rowSubset: true });
          const altExt = reading(alt);
          if (altExt) { sub = alt; ext = altExt; }
        }
      }
      out.set(r.key, { cars: mine.length, extremes: ext, median: ext && sub ? median(sub.gapsMin.filter((g): g is number => g != null)) : null });
    }
    return out;
  }, [live, scheduledRows, data, line, vehicles, recent, now, liveBand, extraTrips, stopPatterns, directionId, rowVehicles, routeShortName]); // eslint-disable-line react-hooks/exhaustive-deps
  // #1877: each destination row's longest gap, keyed as the card names the destination (the first row naming it).
  const gapsKey = rowFigures && scheduledRows ? scheduledRows.flatMap(r => {
    // The shared stretch rides along under its own key, so the card's shared row reads live/schedule too (CIV-3158 follow-up).
    const dest = r.key === 'shared' ? LIVE_SHARED_GAP_KEY : rowDirectionKey(r.headsign, routeShortName);
    const f = rowFigures.get(r.key);
    const ext = f?.extremes;
    return dest && ext && f.median != null ? [`${dest}\t${ext.rangeFrom ?? ''}\t${ext.longest.min}\t${f.median}`] : [];
  }).join('\n') : '';
  useEffect(() => {
    if (!onDestinationGaps) return;
    const gaps = new Map<string, LiveRowGap>();
    for (const l of gapsKey ? gapsKey.split('\n') : []) {
      const [k, from, longest, mid] = l.split('\t');
      if (!gaps.has(k)) gaps.set(k, { from: from === '' ? null : Number(from), longest: Number(longest), median: Number(mid) });
    }
    onDestinationGaps(directionId, gaps);
  }, [onDestinationGaps, gapsKey, directionId]);
  if (!line || !live || onDestinationGaps) return null;

  const extremes = !live.incomplete ? gapExtremes(live) : null;

  // On time by the same standard as each vehicle's own label (getVehicleStatus), over the cars counted above.
  // Left out where none of them reports how late it is (TTC streetcars today): the count would only say 0.
  const counted = new Set(live.carIds ?? []);
  const reporting = vehicles.filter(v => counted.has(v.id) && v.delayMin != null);
  const onTime = reporting.length ? reporting.filter(v => vehicleStatus(v) === 'on_time').length : null;

  return (
    <div className="flex flex-col gap-2">
      {heading && <CardSectionLabel className="mb-0">{heading}</CardSectionLabel>}
      {live.incomplete ? (
        // #1833: while the recorded half hour is still on its way, the thin first poll is loading, not a failure.
        <div className="text-xs font-bold text-[var(--text-muted)]">{seedSettled ? LIVE_FEED_INCOMPLETE : LOADING_LABEL}</div>
      ) : (
        <>
          {/* CIV-2901 (Ryan, mock v2: "the destinations like in the regular map route cards"): one row per destination in
              the map card's own row (CardDirectionRow), its vehicle count on the right and its longest gap under it; the
              rows add up to the direction's count, with any vehicle not matched to a destination on a row of its own. */}
          {(() => {
            const dest = (scheduledRows ?? []).filter(r => r.key !== 'shared' && rowFigures?.has(r.key));
            if (!dest.length || !rowFigures) {
              return <Stats items={[[VEHICLES_LABEL, String(live.cars)], ...(onTime != null ? [[ON_TIME_LABEL, String(onTime)] as [string, string]] : [])]} />;
            }
            const matched = dest.reduce((n, r) => n + (rowFigures.get(r.key)?.cars ?? 0), 0);
            // Ryan, 2026-11-27 ("Then this should use a similar/same design for that part"): each destination once, as the
            // main card's row: its scheduled figure with the live gaps beside it, its vehicles under its name. No separate
            // Scheduled section.
            return (
              <div className="space-y-1">
                {(scheduledRows ?? []).map(r => {
                  const f = rowFigures.get(r.key);
                  const shared = r.key === 'shared';
                  const sched = scheduledRowProps(r);
                  // CIV-3158: the same lines as the card's rows (liveOrScheduleProps): vehicles, live, schedule; the schedule
                  // alone where there is no live range, the shared stretch included.
                  const gap = f?.extremes && f.median != null ? { from: f.extremes.rangeFrom, longest: f.extremes.longest.min, median: f.median } : null;
                  return (
                    <CardDirectionRow
                      key={r.key}
                      {...sched}
                      {...(f || shared ? liveOrScheduleProps(gap, sched, { firstLine: shared }) : {})}
                      labelEnd={f && !shared ? countOf(f.cars, 'vehicle') : undefined}
                    />
                  );
                })}
                {live.cars > matched && (
                  <CardDirectionRow labelWeight="regular" label={LIVE_UNMATCHED_DESTINATION} labelEnd={countOf(live.cars - matched, 'vehicle')} />
                )}
              </div>
            );
          })()}
          {period && !(scheduledRows ?? []).some(r => r.key !== 'shared' && rowFigures?.has(r.key)) && scheduledBlock}
          {/* CIV-2045: the longest and shortest gap, only where the card has no destination rows to carry them. */}
          {extremes && !(scheduledRows && scheduledRows.length > 0 && rowFigures) && (
            <Stats items={[
              [LONGEST_GAP_LABEL, gapText(extremes.longest.min), extremes.longest.tooFar ? AMBER : undefined],
              [SHORTEST_GAP_LABEL, gapText(extremes.shortest.min), extremes.shortest.tooClose ? AMBER : undefined],
            ]} />
          )}
        </>
      )}
    </div>
  );
}
