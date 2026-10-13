import type { GtfsData, GtfsStopTime } from '../../types/gtfs.js';

/**
 * GTFS lets a feed leave arrival and departure times blank at stops that are not timepoints;
 * a consumer is expected to interpolate them. Amarillo City Transit's 2024 feed times only 41
 * of its 293 stops, so without this every untimed stop drops out of the stop index (#753).
 * Fills each blank stop between two timed stops of the same trip, by shape_dist_traveled when
 * the trip has it increasing throughout, otherwise evenly by stop order. Stops before the
 * first or after the last timed stop stay blank. Opt-in per agency (preprocess
 * "interpolate-untimed-stops").
 */
export function interpolateUntimedStops(gtfs: GtfsData): { gtfs: GtfsData; filled: number } {
  const byTrip = new Map<string, GtfsStopTime[]>();
  for (const st of gtfs.stopTimes ?? []) {
    const list = byTrip.get(st.trip_id);
    if (list) list.push(st);
    else byTrip.set(st.trip_id, [st]);
  }
  const filledTimes = new Map<GtfsStopTime, string>();
  for (const stops of byTrip.values()) {
    const sorted = [...stops].sort((a, b) => Number(a.stop_sequence) - Number(b.stop_sequence));
    const dists = sorted.map(st => (st.shape_dist_traveled?.trim() ? Number(st.shape_dist_traveled) : NaN));
    const useDist = dists.every((d, i) => Number.isFinite(d) && (i === 0 || d >= dists[i - 1]));
    let prev = -1;
    for (let i = 0; i < sorted.length; i++) {
      const seconds = toSeconds(sorted[i].departure_time || sorted[i].arrival_time);
      if (seconds == null) continue;
      if (prev >= 0 && i - prev > 1) {
        const start = toSeconds(sorted[prev].departure_time || sorted[prev].arrival_time)!;
        const span = useDist ? dists[i] - dists[prev] : i - prev;
        for (let j = prev + 1; j < i; j++) {
          const share = span > 0 ? (useDist ? dists[j] - dists[prev] : j - prev) / span : 0;
          filledTimes.set(sorted[j], fromSeconds(Math.round(start + share * (seconds - start))));
        }
      }
      prev = i;
    }
  }
  if (filledTimes.size === 0) return { gtfs, filled: 0 };
  return {
    gtfs: {
      ...gtfs,
      stopTimes: gtfs.stopTimes.map(st => {
        const time = filledTimes.get(st);
        return time ? { ...st, arrival_time: time, departure_time: time } : st;
      }),
    },
    filled: filledTimes.size,
  };
}

function toSeconds(value: string | undefined): number | null {
  const match = value?.trim().match(/^(\d+):(\d{2}):(\d{2})$/);
  return match ? Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) : null;
}

function fromSeconds(total: number): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
}
