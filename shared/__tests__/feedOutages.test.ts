import { describe, expect, it } from 'vitest';
import { feedGaps, routeEmptyMinutes } from '../feedOutages';

const T0 = 1_760_000_000 - (1_760_000_000 % 60);
const at = (min: number) => T0 + min * 60;
const range = (a: number, b: number) => Array.from({ length: b - a }, (_, i) => at(a + i));
const scheduledBetween = (a: number, b: number) => (m: number) => (m >= Math.floor(at(a) / 60) && m < Math.floor(at(b) / 60) ? 6 : 0);

describe('feed outages from times only', () => {
  it('route-only outage: feed keeps snapshotting, route has no vehicles for 3 hours while scheduled', () => {
    const feed = range(0, 480);
    const route = [...range(0, 100), ...range(280, 480)];
    const r = routeEmptyMinutes(feed, route, scheduledBetween(0, 480));
    expect(r.snapshots).toBe(180);
    expect(r.minutes.has(Math.floor(at(150) / 60))).toBe(true);
    expect(r.minutes.has(Math.floor(at(50) / 60))).toBe(false);
  });
  it('same result with the empty-line format and the absent-line format', () => {
    const feed = range(0, 480);
    const lines = feed.map(ts => ({ ts, vehicles: ts >= at(100) && ts < at(280) ? 0 : 3 }));
    const withEmpty = lines;                             // older fetcher keeps {ts, v: []}
    const without = lines.filter(l => l.vehicles > 0);   // --routes all leaves them out
    const run = (l: typeof lines) => routeEmptyMinutes(feed, l.filter(x => x.vehicles > 0).map(x => x.ts), scheduledBetween(0, 480));
    expect(run(withEmpty)).toEqual(run(without));
    expect(run(without).snapshots).toBe(180);
  });
  it('a quiet period when the route is not scheduled is not an outage', () => {
    const feed = range(0, 480);
    const route = [...range(0, 100), ...range(280, 480)];
    expect(routeEmptyMinutes(feed, route, scheduledBetween(280, 480)).snapshots).toBe(0);
    expect(routeEmptyMinutes(feed, route, () => 3).snapshots).toBe(0); // fewer than 4 trips in service
  });
  it('a feed-wide gap is an outage for every route', () => {
    const feed = [...range(0, 100), ...range(160, 200)];
    expect(feedGaps(feed)).toEqual([[at(99), at(160)]]);
    // the same gap whichever route asks: the gaps come from the feed's times, not any route's lines
    expect(feedGaps(feed)).toEqual(feedGaps([...feed].reverse()));
    // and snapshots inside a feed gap are not double counted as route-only outages (they do not exist)
    expect(routeEmptyMinutes(feed, range(0, 100), scheduledBetween(0, 200)).snapshots).toBe(0 + 40);
  });
  it('minute-spaced snapshots and a short hiccup are not a feed gap', () => {
    expect(feedGaps(range(0, 50))).toEqual([]);
    expect(feedGaps([at(0), at(0) + 170, at(0) + 340])).toEqual([]);
  });
});
