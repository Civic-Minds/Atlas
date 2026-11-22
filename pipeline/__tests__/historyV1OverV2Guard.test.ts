import { describe, expect, it } from 'vitest';
import { v1OverV2Refusal, v2SnapshotCount } from '../historyV2Flag.js';

// #1703: a flag-off build replaced the live v2 History file with the v1 output (TTC and CTA gone, MBTA 215 -> 45 routes).
const config = (snaps: Array<Record<string, unknown>>) => JSON.stringify([
  { slug: 'mbta', name: 'MBTA', routes: [{ routeShortName: '1', snapshots: snaps }] },
  { slug: 'ttc', name: 'TTC', routes: [] },
]);

describe('v2SnapshotCount', () => {
  it('counts only snapshots marked v2', () => {
    expect(v2SnapshotCount(config([{ year: 2014, v2: true }, { year: 2015 }, { year: 2016, v2: true }]))).toBe(2);
    expect(v2SnapshotCount(config([{ year: 2014 }]))).toBe(0);
  });
  it('reads unparseable or non-list text as none', () => {
    expect(v2SnapshotCount('not json')).toBe(0);
    expect(v2SnapshotCount('{"slug":"mbta"}')).toBe(0);
  });
});

describe('v1OverV2Refusal', () => {
  const live = config([{ year: 2014, v2: true }]);
  it('refuses a flag-off build over a live v2 file', () => {
    expect(v1OverV2Refusal(false, live)).toMatch(/Refusing to publish.*1 History v2 snapshots.*ATLAS_HISTORY_V2=1/);
  });
  it('lets a v2 build write over it', () => {
    expect(v1OverV2Refusal(true, live)).toBeNull();
  });
  it('lets a flag-off build write over a v1 file or a missing one', () => {
    expect(v1OverV2Refusal(false, config([{ year: 2014 }]))).toBeNull();
    expect(v1OverV2Refusal(false, null)).toBeNull();
  });
});
