import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BUNCHED_GAP_SEC, GAPPED_FACTOR, LIVE_STALE_SEC } from '../../shared/rules/live';
import { DEFAULT_CUTOFFS } from '../../shared/liveCutoffs';
import { NOW_WINDOW_MIN } from '../../shared/liveNow';
import { RECENT_WINDOW_SEC } from '../utils/livePerformance';

/**
 * CIV-3177 (Ryan: "Like my main concern is if things are calculated differently in both live modes"): main Live's
 * route card, Studio Live's route panel and the MCP's route_now must read a route right now the same way.
 *
 * Today main Live and Studio share one reading (LiveRoutePerformance over src/utils/livePerformance.ts's liveGaps), and
 * route_now has its own (shared/liveNow.ts's routeNow). Admin is merging the two (CIV-3173). Until then this guard:
 * - keeps Studio on the map's reading, never a copy of it;
 * - keeps the cut-offs both readings use equal to the one source (shared/rules/live.ts);
 * - lists every number the two readings type by hand. A new one fails here; a listed one that goes away fails too, so
 *   the list shrinks as CIV-3173 moves them into shared/rules/live.ts.
 */
const ROOT = join(import.meta.dirname, '..', '..');
const read = (f: string) => readFileSync(join(ROOT, f), 'utf8');

/** The files that work out a route's figures right now, for each of the three views. */
const RIGHT_NOW_FILES = [
  'shared/liveNow.ts',
  'scripts/mcp/liveNowTools.ts',
  'src/utils/livePerformance.ts',
  'src/components/Live/LiveRoutePerformance.tsx',
  'src/apps/LiveVehicles.tsx',
  'src/apps/studio/RouteRightNow.tsx',
] as const;

/** A number typed into a right-now file: a named constant, or a bare threshold of 100 or more in a comparison. */
const HAND_TYPED = [/^\s*(?:export )?const ([A-Z][A-Z0-9_]+) = [\d(][^;]*;/gm, /[<>]=?\s*(\d{3,})\b/g];

/**
 * Hand-typed numbers there today, by file. Each is a debt with an owner (CIV-3173), not a pattern to copy: the matching
 * figure in the other reading is named beside it where the two differ.
 */
const KNOWN: Record<string, string[]> = {
  // route_now: 30-min window, 10-min "now", 150 m off the line (the map's card: 60 m), 200 m to count as moving.
  'shared/liveNow.ts': ['NOW_WINDOW_MIN', 'NOW_RECENT_MIN', 'NOW_MAX_OFF_LINE_M', 'NOW_MOVING_M', 'SAME_VEHICLE_SEC'],
  // The map's and Studio's card: 60 m off the line (route_now: 150 m), and the moving/parked test typed inline as
  // 200 m in 600 s (route_now: NOW_MOVING_M in NOW_RECENT_MIN).
  'src/utils/livePerformance.ts': ['STRIP_ROWS', 'MAX_PLACE_M', 'MAX_BRACKET_SEC', 'RECENT_WINDOW_SEC', '600', '200'],
  'src/apps/LiveVehicles.tsx': ['MIN_LIVE_ZOOM'],
};

function handTyped(text: string): string[] {
  return [...new Set(HAND_TYPED.flatMap(re => [...text.matchAll(re)].map(m => m[1])))];
}

describe('Live right now: one way of reading a route (CIV-3177)', () => {
  it('Studio reads a route right now through the map card\'s own pieces, not a copy', () => {
    const studio = read('src/apps/studio/RouteRightNow.tsx');
    const map = read('src/apps/LiveVehicles.tsx');
    for (const piece of ['LiveRoutePerformance', 'resolveLiveVehicles', 'useLiveFeeds', 'useLiveTripDirections', 'mergeIntoCardRows', 'groupVehiclesByDirection', 'directionSummary']) {
      expect(studio, `Studio's route panel should use ${piece}`).toContain(piece);
      expect(map, `main Live should use ${piece}`).toContain(piece);
    }
  });

  it('only the shared card component works out live gaps', () => {
    const callers = RIGHT_NOW_FILES.filter(f => /\bliveGaps\(/.test(read(f)) && f !== 'src/utils/livePerformance.ts');
    expect(callers).toEqual(['src/components/Live/LiveRoutePerformance.tsx']);
  });

  it('both readings use the same cut-offs and window as shared/rules/live.ts', () => {
    expect(DEFAULT_CUTOFFS.bunchedWithinMin * 60).toBe(BUNCHED_GAP_SEC);
    expect(DEFAULT_CUTOFFS.gappedFactor).toBe(GAPPED_FACTOR);
    expect(RECENT_WINDOW_SEC).toBe(NOW_WINDOW_MIN * 60);
    // Both readings drop positions by the one stale age.
    expect(read('shared/liveNow.ts')).toMatch(/import \{[^}]*\bLIVE_STALE_SEC\b[^}]*\} from '\.\/rules\/live/);
    expect(read('src/utils/livePerformance.ts')).toMatch(/import \{[^}]*\bLIVE_STALE_SEC\b[^}]*\} from '\.\.\/\.\.\/shared\/rules\/live'/);
    expect(LIVE_STALE_SEC).toBeGreaterThan(0);
  });

  it('types no new live number by hand in the right-now files', () => {
    const found = RIGHT_NOW_FILES.flatMap(f => handTyped(read(f)).filter(n => !KNOWN[f]?.includes(n)).map(n => `${f}: ${n}`));
    expect(found, 'put the number in shared/rules/live.ts and import it').toEqual([]);
  });

  it('keeps no listed number that is gone', () => {
    const gone = Object.entries(KNOWN).flatMap(([f, names]) => {
      const now = handTyped(read(f));
      return names.filter(n => !now.includes(n)).map(n => `${f}: ${n}`);
    });
    expect(gone, 'remove it from KNOWN').toEqual([]);
  });
});
