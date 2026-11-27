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
import { addSnapshot, gapExtremes, lineModel, liveGaps, liveTripDirections, positionsSnapshot, type RecentSnapshot, withStats, type LineModel } from '../../utils/livePerformance';
import type { LiveVehicle } from '../../context/LiveVehiclesMapOverlay';
import { vehicleStatus } from '../../utils/colors';
import { LIVE_FEED_INCOMPLETE, LIVE_ROUTE_FIGURES_UNAVAILABLE, LOADING_LABEL, LIVE_UNMATCHED_DESTINATION, RIGHT_NOW_LABEL, VEHICLES_LABEL, SCHEDULED_COLUMN } from '../../content/noticeCopy';
import { LONGEST_GAP_LABEL, ON_TIME_LABEL, SHORTEST_GAP_LABEL } from '../../../shared/liveWording';
import { RIGHT_NOW_STALE_SEC } from '../../../shared/rules/live';

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
/** MOCK (#1877 mock C). */
export interface MockRowReading { every: number | null; cars: number; late: number | null }

interface Props {
  /** CIV-2045: the main map card's own Scheduled lines for the picked direction (liveScheduledRows); none shows nothing. */
  scheduledRows?: ReadonlyArray<LiveScheduledRow> | null;
  /** Main Live (CIV-2901 v3): each direction's own destination rows (liveScheduledRowsNow), so every direction shows at once. */
  scheduledRowsFor?: (directionId: number, label: string) => ReadonlyArray<LiveScheduledRow> | null;
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
  /** MOCK (#1877 mock C, not for merge): each card row's live reading, keyed by the row's key ("shared" or the card row's
   *  id): its live gap now (the average of its measured gaps, in minutes; a new number that needs Ryan's word-for-word OK),
   *  its vehicles, and how many are late (null when none of them reports how late it is). */
  onRowEvery?: (directionId: number, rows: ReadonlyMap<string, MockRowReading>) => void;
}

/**
 * The route's recent positions: the recorded last half hour (CIV-2047, Ryan: gaps as soon as the card opens; local-api
 * live-recent, route_now's reader), then the map's polls since the card opened, up to the last 30 min. A gap needs the car
 * ahead's recent track: how long ago it passed the spot where the car behind is now. Without the recordings (no read
 * token, a route not recorded) the polls alone build it up, as before.
 */
export function useRecentPositions(vehicles: readonly LiveVehicle[], slug: string, routeShortName: string): { recent: RecentSnapshot[]; seedSettled: boolean } {
  const [polls, setPolls] = useState<RecentSnapshot[]>([]);
  const [seed, setSeed] = useState<RecentSnapshot[]>([]);
  // #1833: whether the recorded half hour has come back (or failed). Until then a thin first poll is loading, not a failure.
  const [seedSettled, setSeedSettled] = useState(false);
  useEffect(() => {
    setPolls(b => addSnapshot(b, positionsSnapshot(vehicles, Math.floor(Date.now() / 1000))));
  }, [vehicles]);
  useEffect(() => {
    let live = true;
    setSeed([]);
    setSeedSettled(false);
    Promise.resolve()
      .then(() => liveCloudFetch('recent', { agency: slug, route: routeShortName }))
      .then(r => (r.ok ? r.json() as Promise<{ snapshots?: RecentSnapshot[] }> : null))
      .then(j => { if (live && j?.snapshots?.length) setSeed(j.snapshots); })
      .catch(() => {})
      .finally(() => { if (live) setSeedSettled(true); });
    return () => { live = false; };
  }, [slug, routeShortName]);
  const recent = useMemo(() => {
    if (!seed.length) return polls;
    // The recordings up to the first poll, then the polls: one history, oldest first.
    const first = polls[0]?.capturedAt ?? Infinity;
    return [...seed.filter(sn => sn.capturedAt < first), ...polls].reduce<RecentSnapshot[]>((b, sn) => addSnapshot(b, sn), []);
  }, [seed, polls]);
  return { recent, seedSettled };
}


/**
 * The Live route card's "Right now" (CIV-2901 v3, Ryan: "why are we not using the same code as in the regular app"): main
 * Live shows it inside the regular route card (RouteCardHeadway's own section slot), every direction one under another,
 * as the regular card lists them, with no toggle; the card's own destination rows already give the schedule. Studio's panel
 * (CIV-2021) steers it to one direction with its own Direction chip and keeps the Scheduled lines, having no route card.
 */
export default function LiveRoutePerformance({ slug, routeShortName, vehicles, feedDegraded, onCounted, scheduledRows, scheduledRowsFor, direction, unavailableMessage = LIVE_ROUTE_FIGURES_UNAVAILABLE, liveEnabled, onRowEvery }: Props) {
  const steered = direction !== undefined;
  const { data: loaded, settled } = useSegmentDelayStatus(slug, routeShortName, liveEnabled);
  const data = loaded as (SegmentDelayData & { tripDirections?: Record<string, string[]> }) | null;
  const directions = useMemo(() => Object.entries(data?.directionLabels ?? {}).map(([id, label]) => [Number(id), label] as const), [data]);
  const { recent, seedSettled } = useRecentPositions(vehicles, slug, routeShortName);
  // Re-checked every 30 s, so a feed that stops updating shows as incomplete instead of frozen.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, [recent]);

  // CIV-2045 (Ryan: "1"), CIV-2901: Studio's Scheduled lines, the main map card's own destination rows in its own row
  // component, with its headway dot.
  const scheduledBlock = steered && scheduledRows && scheduledRows.length > 0 ? (
                <div className="space-y-1">
                  <CardSectionLabel className="mb-0">{SCHEDULED_COLUMN}</CardSectionLabel>
                  {scheduledRows.map(r => {
                    // The row's own number, else the one its words name ("every 10 min" on a row with no gap of its own).
                    const every = r.headwayMin ?? (Number(/^every (\d+)/.exec(r.value)?.[1]) || null);
                    return (
                      <CardDirectionRow
                        key={r.key}
                        labelWeight={r.key === 'shared' ? 'bold' : 'regular'}
                        label={r.label}
                        headway={every ?? undefined}
                        headwayLabel={every != null && r.value !== headwayEvery(every) ? r.value : undefined}
                        limited={every == null}
                        limitedLabel={every == null ? r.value : undefined}
                        wrapLongValue
                      />
                    );
                  })}
                </div>
  ) : null;
  // Loaded and still missing: Live has no analysis for this route, so "Right now" can't show; one grey line says so (CIV-1413 B).
  // While it loads, nothing. #1796 (Ryan: "This says live vehicles arent available on this route but then shows me live vehicles
  // lol"): main Live's line shows only while the route has no live vehicle; with some, the card's vehicle list below is live.
  if (!data) {
    if (!settled) return null;
    const note = steered || vehicles.length === 0 ? <CardHelpNotice message={unavailableMessage} /> : null;
    return note || scheduledBlock ? <div className="flex flex-col gap-3">{note}{scheduledBlock}</div> : null;
  }
  if (!directions.length) return null;

  // Fresh data needs no time; stale data says when it was last updated (by the newest vehicle report).
  const newest = Math.max(0, ...vehicles.map(v => v.tsEpoch ?? 0));
  const rightNowLabel = newest > 0 && now / 1000 - newest > RIGHT_NOW_STALE_SEC
    ? `${RIGHT_NOW_LABEL} · last updated ${agencyTime(slug, new Date(newest * 1000))}`
    : RIGHT_NOW_LABEL;
  if (feedDegraded) return null;

  const shown = steered
    ? [directions.find(([id]) => id === direction) ?? directions[0]]
    : directions;
  return (
    <SidebarCardSection label={rightNowLabel}>
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
            now={now}
            scheduledRows={steered ? scheduledRows : scheduledRowsFor?.(id, label) ?? null}
            scheduledBlock={scheduledBlock}
            onCounted={steered ? onCounted : undefined}
            onRowEvery={onRowEvery}
          />
        ))}
      </div>
    </SidebarCardSection>
  );
}

/** One direction's "Right now": its vehicles by destination row, each with its longest gap (CIV-2047). */
function DirectionRightNow({ data, directionId, directionLabel, heading, slug, routeShortName, vehicles, recent, seedSettled, now, scheduledRows, scheduledBlock, onCounted, onRowEvery }: {
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
  onRowEvery?: Props['onRowEvery'];
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

  // CIV-2047: the counted cars by the card row (service pattern) they run, and each row's own gaps: the same live-gap
  // calculation on that row's cars only, judged against the row's own scheduled gap. The shared stretch takes every car.
  const stopPatterns = useRouteAnalysis(slug, routeShortName, !!scheduledRows?.length).value?.stopPatterns;
  const rowFigures = useMemo(() => {
    if (!live || live.incomplete || !scheduledRows?.length || !line) return null;
    const ids0 = new Set(live.carIds ?? []);
    const cars = vehicles.filter(v => ids0.has(v.id));
    const only = branchOnlyStops(stopPatterns?.[String(directionId)] ?? [], scheduledRows);
    const groups = vehiclesByPattern(cars, only);
    const out = new Map<string, { cars: number; extremes: ReturnType<typeof gapExtremes>; every: number | null; late: number | null }>();
    for (const r of scheduledRows) {
      const mine = r.key === 'shared' ? cars : groups.get(r.key) ?? [];
      if (r.key !== 'shared' && !only.has(r.key)) continue;
      const ids = new Set(mine.map(v => v.id));
      const sub = r.key === 'shared' ? live : liveGaps(data, line, withStats(line, liveBand), liveBand, recent.map(sn => ({ ...sn, v: sn.v.filter(e => ids.has(e[0])) })), Math.floor(now / 1000), { skipUnseenAdded: true, countFewCars: true, wholeLine: true, extraTrips, rowSubset: true });
      const ext = sub && !sub.incomplete ? gapExtremes({ gapsMin: sub.gapsMin, scheduledSec: r.headwayMin != null ? r.headwayMin * 60 : sub.scheduledSec }) : null;
      // MOCK (#1877 mock C): the average measured gap (the time from the first car to the last over the gaps between them, so
      // a bunched pair doesn't pull it down as the middle gap did), under the same "more than half measured" rule as gapExtremes.
      const measured = sub && !sub.incomplete ? sub.gapsMin.filter((g): g is number => g != null) : [];
      const every = sub && measured.length > 0 && measured.length * 2 > sub.gapsMin.length ? Math.round(measured.reduce((a, b) => a + b, 0) / measured.length) : null;
      const reportingLate = mine.filter(v => v.delayMin != null);
      const late = reportingLate.length ? reportingLate.filter(v => vehicleStatus(v) === 'late').length : null;
      out.set(r.key, { cars: mine.length, extremes: ext, every, late });
    }
    return out;
  }, [live, scheduledRows, data, line, vehicles, recent, now, liveBand, extraTrips, stopPatterns, directionId]); // eslint-disable-line react-hooks/exhaustive-deps
  const everyKey = rowFigures && scheduledRows ? scheduledRows.filter(r => rowFigures.has(r.key)).map(r => { const f = rowFigures.get(r.key)!; return `${r.key}\t${f.every ?? ''}\t${f.cars}\t${f.late ?? ''}`; }).join('\n') : '';
  useEffect(() => {
    const num = (x: string) => (x === '' ? null : Number(x));
    onRowEvery?.(directionId, new Map(everyKey ? everyKey.split('\n').map(l => { const [k, e, c, la] = l.split('\t'); return [k, { every: num(e), cars: Number(c), late: num(la) }] as const; }) : []));
  }, [onRowEvery, everyKey, directionId]);
  if (!line || !live) return null;

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
            return (
              <div className="space-y-1">
                {dest.map(r => {
                  const f = rowFigures.get(r.key)!;
                  return (
                    <CardDirectionRow
                      key={r.key}
                      labelWeight="regular"
                      label={r.label}
                      value={<span className="text-sm font-black text-[var(--text-primary)] whitespace-nowrap">{countOf(f.cars, 'vehicle')}</span>}
                      subLabel={f.extremes ? `${LONGEST_GAP_LABEL.toLowerCase()} ${gapText(f.extremes.longest.min)}` : undefined}
                      subLabelWeight="medium"
                    />
                  );
                })}
                {live.cars > matched && (
                  <CardDirectionRow labelWeight="regular" label={LIVE_UNMATCHED_DESTINATION} value={<span className="text-sm font-black text-[var(--text-primary)] whitespace-nowrap">{countOf(live.cars - matched, 'vehicle')}</span>} />
                )}
              </div>
            );
          })()}
          {period && scheduledBlock}
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
