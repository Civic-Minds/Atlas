import { Fragment, useEffect, useMemo, useState } from 'react';
import PillGroup from '../ui/PillGroup';
import { SidebarCardSection } from '../Interval/cardUi';
import { useSegmentDelay } from '../../hooks/useSegmentDelay';
import { readUrlNumberParam, syncUrlParams } from '../../utils/syncUrlParams';
import { periodKeyForHour } from '../../../shared/config';
import { LIVE_AGENCY_TIMEZONES } from '../../../shared/livePollingConfig';
import { halfMinutes, type SegmentBand, type SegmentDelayData } from '../../utils/segmentDelayView';
import { addSnapshot, lineModel, liveGaps, positionsSnapshot, type RecentSnapshot, sharedSummary, withStats, type LineModel } from '../../utils/livePerformance';
import type { LiveVehicle } from '../../context/LiveVehiclesMapOverlay';

function halfText(m: number): string {
  const whole = Math.floor(Math.abs(m));
  const half = Math.abs(m) - whole >= 0.5;
  return `${m < 0 ? '−' : ''}${whole === 0 && half ? '' : whole}${half ? '½' : ''}`;
}

/** "3½", "10", "½" — minutes to the nearest ½. */
export function mins(sec: number): string {
  return halfText(halfMinutes(sec));
}

/** The timetable's gap: one value, or a range when the period mixes headways ("8–14"). */
export function schedText(st: { scheduledMedianGapSec: number; scheduledP10Sec?: number; scheduledP90Sec?: number }): string {
  const lo = st.scheduledP10Sec, hi = st.scheduledP90Sec;
  if (lo == null || hi == null || mins(lo) === mins(hi)) return mins(st.scheduledMedianGapSec);
  return `${mins(lo)}–${mins(hi)}`;
}

const AMBER = 'var(--status-caution-text)';

/** The agency's hour (LIVE_AGENCY_TIMEZONES); the browser's clock when the agency has no zone listed. */
export function agencyHour(slug: string, d = new Date()): number {
  return Number(new Intl.DateTimeFormat('en-CA', { hour: 'numeric', hourCycle: 'h23', timeZone: LIVE_AGENCY_TIMEZONES[slug] }).format(d));
}

/** "11:42 pm" on the agency's clock. */
export function agencyTime(slug: string, d = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { hour: 'numeric', minute: '2-digit', timeZone: LIVE_AGENCY_TIMEZONES[slug] }).format(d).replace('a.m.', 'am').replace('p.m.', 'pm');
}

/** The period now at the agency, when the archive has it (late night included), else all day. */
function livePeriod(data: SegmentDelayData, slug: string): SegmentBand {
  const key = periodKeyForHour(agencyHour(slug));
  return key && (data.headways ?? []).some(h => h.bands[key]) ? (key as SegmentBand) : 'all';
}

/**
 * A row of small labelled figures. Labels wrap rather than cut off ("Cars (College)" on a desktop card); labels
 * share the first grid row and figures the second, so the figures stay level when one label takes two lines.
 */
function Stats({ items }: { items: [string, string][] }) {
  return (
    <div className="grid grid-cols-3 grid-rows-[auto_auto] grid-flow-col gap-x-2">
      {items.map(([label, value]) => (
        <Fragment key={label}>
          <div className="min-w-0 self-end text-xs font-bold text-[var(--text-dim)] leading-snug break-words">{label}</div>
          <div className="min-w-0 text-sm font-black text-[var(--text-primary)] tabular-nums whitespace-nowrap">{value}</div>
        </Fragment>
      ))}
    </div>
  );
}

interface Props {
  slug: string;
  routeShortName: string;
  /** The route's vehicles as the map shows them (every poll); "Right now" is built from these. */
  vehicles: readonly LiveVehicle[];
  /** Live feed is down, stale or incomplete: "Right now" is hidden. */
  feedDegraded: boolean;
}

/**
 * The map's polls of the route's vehicles since the card opened (up to the last 30 min). A gap needs
 * the car ahead's recent track: how long ago it passed the spot where the car behind is now.
 */
function useRecentPositions(vehicles: readonly LiveVehicle[]): RecentSnapshot[] {
  const [buffer, setBuffer] = useState<RecentSnapshot[]>([]);
  useEffect(() => {
    setBuffer(b => addSnapshot(b, positionsSnapshot(vehicles, Math.floor(Date.now() / 1000))));
  }, [vehicles]);
  return buffer;
}

/** The Live route card: only what is live now ("Right now"), per direction. */
export default function LiveRoutePerformance({ slug, routeShortName, vehicles, feedDegraded }: Props) {
  const data = useSegmentDelay(slug, routeShortName) as (SegmentDelayData & { tripDirections?: Record<string, string[]> }) | null;
  // The direction lives in the URL (dir) so a shared link reopens it.
  const directions = useMemo(() => Object.entries(data?.directionLabels ?? {}).map(([id, label]) => [Number(id), label] as const), [data]);
  const [dir, setDir] = useState<number | null>(() => readUrlNumberParam('dir'));
  const directionId = directions.some(([id]) => id === dir) ? dir! : directions[0]?.[0] ?? 0;
  const recent = useRecentPositions(vehicles);
  // Re-checked every 30 s, so a feed that stops updating shows as incomplete instead of frozen.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, [recent]);

  const line: LineModel | null = useMemo(() => (data ? lineModel(data, directionId) : null), [data, directionId]);

  useEffect(() => {
    if (!data) return;
    syncUrlParams({ dir: dir == null ? null : String(directionId) });
  }, [data, dir, directionId]);
  useEffect(() => () => syncUrlParams({ dir: null }), []);

  if (!data || !line) return null;

  const replacement = (data as { replacementBuses?: boolean }).replacementBuses
    ? <div className="text-xs font-black text-[var(--status-caution-text)]">Replacement buses: all figures describe the buses running this route</div>
    : null;

  const liveBand = livePeriod(data, slug);
  const liveSched = sharedSummary(data, line, liveBand);
  // From the map's own polls, not the archive. A trip the timetable doesn't list is placed by its own
  // movement since the card opened; until it has been seen twice it is skipped (skipUnseenAdded).
  // With 0 or 1 car the count still shows (no gaps line), so the direction pills never vanish.
  const live = feedDegraded ? null : liveGaps(data, line, withStats(line, liveBand), liveBand, recent, Math.floor(now / 1000), { skipUnseenAdded: true, countFewCars: true });

  return (
    <div className="flex flex-col gap-3">
      {replacement}

      {/* The direction pills only steer "Right now", so they show only with it. */}
      {live && directions.length > 1 && <PillGroup label="Direction" options={directions} value={directionId} onChange={setDir} />}

      {live && (
        <SidebarCardSection label={`Right now · ${agencyTime(slug, new Date(now))}`}>
          {live.incomplete ? (
            <div className="text-xs font-bold text-[var(--text-muted)]">Live feed incomplete right now</div>
          ) : (
            <>
              <Stats items={[
                [`Cars${line.sharedStreet ? ` (${line.sharedStreet.replace(/\s+(St|Ave|Rd|Blvd)$/i, '')})` : ''}`, String(live.cars)],
                ['Scheduled', `every ${liveSched ? schedText(liveSched) : live.scheduledSec ? mins(live.scheduledSec) : '–'}`],
              ]} />
              {/* Only once a gap is known: right after the card opens the map has no track of the cars ahead yet. */}
              {live.gapsMin.some(g => g != null) && (
                <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-xs font-bold tabular-nums">
                  <span className="text-[var(--text-dim)]">Gaps, front to back (min)</span>
                  {live.gapsMin.map((g, i) => (
                    g == null
                      ? <span key={i} className="text-[var(--text-dim)]" title="The car ahead's passing wasn't seen">–</span>
                      : <span key={i} style={live.scheduledSec && g * 60 >= 2 * live.scheduledSec ? { color: AMBER } : undefined} className={live.scheduledSec && g * 60 >= 2 * live.scheduledSec ? 'font-black' : 'text-[var(--text-primary)]'}>{g}</span>
                  ))}
                </div>
              )}
            </>
          )}
        </SidebarCardSection>
      )}
    </div>
  );
}
