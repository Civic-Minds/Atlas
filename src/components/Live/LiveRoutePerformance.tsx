import React, { useEffect, useMemo, useState } from 'react';
import Pill from '../ui/Pill';
import { useSegmentDelay } from '../../hooks/useSegmentDelay';
import { syncUrlParams } from '../../utils/syncUrlParams';
import { periodKeyForHour } from '../../../shared/config';
import { halfMinutes, type SegmentBand, type SegmentDelayData } from '../../utils/segmentDelayView';
import { lineModel, liveGaps, type RecentSnapshot, sharedSummary, withStats, type LineModel } from '../../utils/livePerformance';

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

const HEAD = 'text-xs font-black text-[var(--text-dim)]';
const AMBER = 'var(--status-caution-text)';

function torontoHour(d = new Date()): number {
  return Number(new Intl.DateTimeFormat('en-CA', { hour: 'numeric', hourCycle: 'h23', timeZone: 'America/Toronto' }).format(d));
}

function torontoTime(d = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Toronto' }).format(d).replace('a.m.', 'am').replace('p.m.', 'pm');
}

/** The period now, when the archive has it (late night included), else all day. */
function livePeriod(data: SegmentDelayData): SegmentBand {
  const key = periodKeyForHour(torontoHour());
  return key && (data.headways ?? []).some(h => h.bands[key]) ? (key as SegmentBand) : 'all';
}

function Chips<T extends string | number>({ options, value, onChange }: { options: { id: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map(o => <Pill key={String(o.id)} selected={value === o.id} onClick={() => onChange(o.id)}>{o.label}</Pill>)}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 pt-3 border-t border-[var(--border-primary)]">
      <div className={HEAD}>{title}</div>
      {children}
    </div>
  );
}

/** A row of small labelled figures. */
function Stats({ items }: { items: [string, string][] }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {items.map(([label, value]) => (
        <div key={label} className="min-w-0">
          <div className="text-xs font-bold text-[var(--text-dim)] truncate">{label}</div>
          <div className="text-sm font-black text-[var(--text-primary)] tabular-nums whitespace-nowrap">{value}</div>
        </div>
      ))}
    </div>
  );
}

interface Props {
  slug: string;
  routeShortName: string;
  /** Live feed is down, stale or incomplete: "Right now" is hidden. */
  feedDegraded: boolean;
  /** Unused since CIV-892 (the card no longer opens a stretch); still passed by LiveVehicles. */
  onZoom?: (bounds: [number, number, number, number]) => void;
  /** Unused since CIV-892 (no stretch to highlight); still passed by LiveVehicles. */
  onHighlight?: (coordinates: [number, number][] | null) => void;
  /** Unused since CIV-892 (no map line-click into a stretch); still passed by LiveVehicles. */
  registerMapClick?: (fn: ((lonLat: [number, number], toleranceM: number) => void) | null) => void;
  /** Unused since CIV-892 (no Details screen); still passed by LiveVehicles. */
  onDetailsChange?: (open: boolean) => void;
}

/** The Live route card: only what is live now ("Right now"), per direction. */
export default function LiveRoutePerformance({ slug, routeShortName, feedDegraded }: Props) {
  const data = useSegmentDelay(slug, routeShortName) as (SegmentDelayData & { tripDirections?: Record<string, string[]> }) | null;
  // The direction lives in the URL (dir) so a shared link reopens it.
  const [initial] = useState(() => new URLSearchParams(window.location.search));
  const directions = useMemo(() => Object.entries(data?.directionLabels ?? {}).map(([id, label]) => ({ id: Number(id), label })), [data]);
  const [dir, setDir] = useState<number | null>(() => (initial.get('dir') != null && !Number.isNaN(Number(initial.get('dir'))) ? Number(initial.get('dir')) : null));
  const directionId = directions.some(d => d.id === dir) ? dir! : directions[0]?.id ?? 0;
  const [now, setNow] = useState(() => Date.now());
  // The last 30 min of archived positions for this route, refreshed every 30 s (archive is written each minute).
  const [recent, setRecent] = useState<RecentSnapshot[] | null>(null);
  const [serverNow, setServerNow] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    const load = () => fetch(`/api/live-recent?agency=${encodeURIComponent(slug)}&route=${encodeURIComponent(routeShortName)}`)
      .then(r => (r.ok ? r.json() : null))
      .then(j => { if (!cancelled) { setRecent(Array.isArray(j?.snapshots) ? j.snapshots : null); setServerNow(typeof j?.now === 'number' ? j.now : null); setNow(Date.now()); } })
      .catch(() => { if (!cancelled) setRecent(null); });
    load();
    const t = setInterval(load, 30_000);
    return () => { cancelled = true; clearInterval(t); };
  }, [slug, routeShortName]);

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
  const pickers = (
    <div className="flex flex-col gap-1.5">
      {replacement}
      {directions.length > 1 && <Chips options={directions} value={directionId} onChange={setDir} />}
    </div>
  );

  const liveBand = livePeriod(data);
  const liveSched = sharedSummary(data, line, liveBand);
  const live = feedDegraded || !recent || serverNow == null ? null : liveGaps(data, line, withStats(line, liveBand), liveBand, recent, serverNow);

  return (
    <div className="flex flex-col gap-3">
      {pickers}

      <Section title={`Right now · ${torontoTime(new Date(now))}`}>
        {live && !live.incomplete ? (
          <>
            <Stats items={[
              [`Cars${line.sharedStreet ? ` (${line.sharedStreet.replace(/\s+(St|Ave|Rd|Blvd)$/i, '')})` : ''}`, String(live.cars)],
              ['Scheduled', `every ${liveSched ? schedText(liveSched) : live.scheduledSec ? mins(live.scheduledSec) : '–'}`],
            ]} />
            <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-xs font-bold tabular-nums">
              <span className="text-[var(--text-dim)]">Gaps, front to back (min)</span>
              {live.gapsMin.map((g, i) => (
                g == null
                  ? <span key={i} className="text-[var(--text-dim)]" title="The car ahead's passing wasn't seen">–</span>
                  : <span key={i} style={live.scheduledSec && g * 60 >= 2 * live.scheduledSec ? { color: AMBER } : undefined} className={live.scheduledSec && g * 60 >= 2 * live.scheduledSec ? 'font-black' : 'text-[var(--text-primary)]'}>{g}</span>
              ))}
            </div>
          </>
        ) : (
          <div className="text-xs font-bold text-[var(--text-muted)]">{feedDegraded || !recent || live?.incomplete ? 'Live feed incomplete right now' : 'Fewer than 2 cars on the shared section'}</div>
        )}
      </Section>
    </div>
  );
}
