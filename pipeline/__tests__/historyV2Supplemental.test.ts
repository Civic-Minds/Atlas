import { describe, expect, it } from 'vitest';
import {
  backfillSupplementalPolicy, buildSidecar, buildV2Routes, buildV2RoutesMerged, historyV2Enabled,
  splitFeaturesBySource, BUS_ONLY_NOTE,
} from '../historyV2.js';
import { visibilityCheck } from '../historyV2Build.js';

const wk = (short: string, h: number, extra: Record<string, unknown> = {}) => ({
  properties: { day: 'Weekday', directionId: 0, routeShortName: short, routeAllDayHeadway: h, ...extra },
});
const RAIL = 'https://example.org/gtfs_rail.zip';

describe('supplemental routes in the v2 snapshot', () => {
  const main = [wk('7', 15), wk('9', 30)];
  const rail = [wk('801', 10), wk('802', 12)];
  const merged = [...main, ...rail];
  const sources = [{ url: null, count: main.length }, { url: RAIL, count: rail.length }];

  it('splits merged features back by feed and refuses a mismatched count', () => {
    const parts = splitFeaturesBySource(merged, sources);
    expect(parts.map(p => [p.url, p.features.length])).toEqual([[null, 2], [RAIL, 2]]);
    expect(() => splitFeaturesBySource(merged, [{ url: null, count: 1 }])).toThrow();
  });

  it('includes supplemental routes and records which came from the rail feed', () => {
    const r = buildV2RoutesMerged(splitFeaturesBySource(merged, sources));
    expect(Object.keys(r.routes).sort()).toEqual(['7', '801', '802', '9']);
    expect(r.supplementalRoutes).toEqual({ [RAIL]: ['801', '802'] });
    expect(r.report.routes).toBe(4);
    expect(r.collisions).toEqual([]);
    expect(buildSidecar('s', '20260101', '20260101', r.routes, r.supplementalRoutes).supplementalRoutes).toEqual({ [RAIL]: ['801', '802'] });
  });

  it('an agency without supplemental feeds gets exactly the old result and no new sidecar field', () => {
    const old = buildV2Routes(main);
    const now = buildV2RoutesMerged(splitFeaturesBySource(main, [{ url: null, count: main.length }]));
    expect(now.routes).toEqual(old.routes);
    expect(now.report).toEqual(old.report);
    expect(buildSidecar('s', 'k', '20260101', now.routes, now.supplementalRoutes)).not.toHaveProperty('supplementalRoutes');
  });

  it('reports a key collision and keeps the main-feed route', () => {
    const clash = [wk('7', 15), wk('7', 4), wk('803', 10)];
    const r = buildV2RoutesMerged(splitFeaturesBySource(clash, [{ url: null, count: 1 }, { url: RAIL, count: 2 }]));
    expect(r.routes['7'].rep.h).toBe(15);
    expect(r.collisions).toEqual([{ key: '7', droppedFrom: RAIL }]);
    expect(r.supplementalRoutes).toEqual({ [RAIL]: ['803'] });
    expect(r.report.routes).toBe(2);
  });

  it('the gate is only ATLAS_HISTORY_V2=1', () => {
    expect(historyV2Enabled('1')).toBe(true);
    for (const v of [undefined, '', '0', 'true']) expect(historyV2Enabled(v)).toBe(false);
  });
});

describe('backfill --bus-only', () => {
  it('refuses an agency with supplemental feeds without the flag', () => {
    expect(() => backfillSupplementalPolicy('lacmta', [RAIL], false)).toThrow(/--bus-only/);
  });
  it('proceeds and stamps with the flag', () => {
    expect(backfillSupplementalPolicy('lacmta', [RAIL], true)).toEqual({ busOnly: true, supplementalExcluded: [RAIL], note: BUS_ONLY_NOTE });
    expect(BUS_ONLY_NOTE).toBe('bus feed only; supplemental routes excluded');
  });
  it('leaves agencies without supplemental feeds untouched, flag or not', () => {
    expect(backfillSupplementalPolicy('ttc', undefined, false)).toEqual({ busOnly: false, supplementalExcluded: [] });
    expect(backfillSupplementalPolicy('ttc', [], true)).toEqual({ busOnly: false, supplementalExcluded: [] });
  });
});

describe('visibility: supplemental feeds', () => {
  const hist = { '7': [{ label: '2025', year: 2025, weekdayHeadwayMin: 15 }] };
  it('excluded feed: not included, null first snapshot, note lists current routes with no history', () => {
    const v = visibilityCheck('lacmta', hist, ['7', '801', '802'], 2026, undefined, { urls: [RAIL] });
    expect(v.supplementalFeeds).toEqual([{ url: RAIL, includedInHistory: false, firstSnapshot: null }]);
    expect(v.supplementalNotes).toEqual([`lacmta: supplemental feed (${RAIL}) not in History: 2 current routes have no history (801, 802)`]);
    expect(v.currentWithoutRecentSnapshot).toEqual(['801', '802']); // nothing dropped or hidden
  });
  it('included feed: first snapshot is the earliest sidecar period, no note', () => {
    const v = visibilityCheck('lacmta', hist, ['7', '801'], 2026, undefined, { urls: [RAIL], sidecarPeriodsByUrl: { [RAIL]: ['20260301', '20250601'] } });
    expect(v.supplementalFeeds).toEqual([{ url: RAIL, includedInHistory: true, firstSnapshot: '20250601' }]);
    expect(v.supplementalNotes).toEqual([]);
  });
  it('agencies without supplemental feeds report empty fields', () => {
    const v = visibilityCheck('ttc', hist, ['7'], 2026);
    expect(v.supplementalFeeds).toEqual([]);
    expect(v.supplementalNotes).toEqual([]);
  });
});
