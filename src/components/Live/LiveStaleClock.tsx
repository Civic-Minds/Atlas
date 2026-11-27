import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
import type { LiveVehicle } from '../../context/LiveVehiclesMapOverlay';
import { liveLocationsUpdatedAt } from '../../content/noticeCopy';
import { RIGHT_NOW_STALE_SEC, agencyTime } from './LiveRoutePerformance';

/**
 * CIV-3047 B: when the route's vehicles last reported (epoch seconds), once that is more than RIGHT_NOW_STALE_SEC ago;
 * null while they are reporting. A report stamped later than now (a feed clock running ahead) counts as now, so the time
 * shown is never later than the card's own clock.
 */
export function staleReportSec(vehicles: ReadonlyArray<Pick<LiveVehicle, 'tsEpoch'>>, nowMs: number): number | null {
  const nowSec = nowMs / 1000;
  const newest = Math.max(0, ...vehicles.map(v => (v.tsEpoch != null && v.tsEpoch > 0 ? Math.min(v.tsEpoch, nowSec) : 0)));
  if (!newest) return null;
  return nowSec - newest > RIGHT_NOW_STALE_SEC ? newest : null;
}

/**
 * CIV-3047 B (Ryan, 2026-11-27, picked 1): a clock beside the Live route card's flag, only while the route's vehicles
 * haven't reported recently; its hover says when they last did, on the agency's clock. Checked every 30 s, as "Right now" is.
 */
export default function LiveStaleClock({ slug, vehicles }: { slug: string; vehicles: ReadonlyArray<Pick<LiveVehicle, 'tsEpoch'>> }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, [vehicles]);
  const at = staleReportSec(vehicles, now);
  if (at == null) return null;
  const text = liveLocationsUpdatedAt(agencyTime(slug, new Date(at * 1000)));
  return (
    <span role="img" title={text} aria-label={text} className="shrink-0 p-1 inline-flex text-[var(--status-caution-text)]">
      <Clock className="w-4 h-4" aria-hidden />
    </span>
  );
}
