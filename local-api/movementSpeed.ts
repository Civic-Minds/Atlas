import { metresBetween } from '../shared/geoDistance.js';

/**
 * CIV-1770 (Ryan, 2026-11-16, option 1): a vehicle's speed is worked out from how far it moved between
 * two position reports, not read from the feed. TTC's feed speed is a momentary reading: 18 of 32
 * vehicles on the 501 read 0 km/h, and 11 of those had moved 60-430 m in a minute.
 */

/** Reports further apart than this are too far apart to say how fast the vehicle is going now. */
export const MAX_REPORT_GAP_S = 180;
/** Faster than this is a position jump (a GPS glitch or a reused vehicle id), not a speed. */
export const MAX_PLAUSIBLE_KMH = 120;
/** A sighting older than this is forgotten. */
const FORGET_AFTER_S = 600;

interface Sighting { lat: number; lon: number; ts: number; speedKmh: number | null }

/** The last report seen per agency and vehicle, kept for the life of the local API process. */
export class MovementSpeeds {
  private last = new Map<string, Sighting>();

  /**
   * The vehicle's speed in km/h from its last report with a different time, or null when there is none
   * yet, the reports are too far apart, or the jump is implausible. A repeat of the same report keeps
   * the speed read before.
   */
  speedFor(agency: string, vehicleId: string, lat: number, lon: number, ts: number | null, nowS: number): number | null {
    this.forgetOld(nowS);
    if (ts == null || !Number.isFinite(ts)) return null;
    const key = `${agency}:${vehicleId}`;
    const prev = this.last.get(key);
    if (prev && ts === prev.ts) return prev.speedKmh;
    let speedKmh: number | null = null;
    if (prev && ts > prev.ts && ts - prev.ts <= MAX_REPORT_GAP_S) {
      const kmh = metresBetween(prev, { lat, lon }) / (ts - prev.ts) * 3.6;
      speedKmh = kmh <= MAX_PLAUSIBLE_KMH ? Math.round(kmh) : null;
    }
    if (!prev || ts > prev.ts) this.last.set(key, { lat, lon, ts, speedKmh });
    return speedKmh;
  }

  private forgetOld(nowS: number): void {
    for (const [key, s] of this.last) if (nowS - s.ts > FORGET_AFTER_S) this.last.delete(key);
  }
}
