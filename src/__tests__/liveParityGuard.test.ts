import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BUNCHED_GAP_SEC, GAPPED_FACTOR, LIVE_STALE_SEC } from '../../shared/rules/live';
import { DEFAULT_CUTOFFS } from '../../shared/liveCutoffs';
import { NOW_WINDOW_MIN } from '../../shared/liveNow';
import { RECENT_WINDOW_SEC } from '../../shared/liveCore';

/**
 * CIV-3177 (Ryan: "Like my main concern is if things are calculated differently in both live modes"): main Live's
 * route card, Studio Live's route panel and the MCP's route_now must read a route right now the same way.
 *
 * CIV-3173 (Ryan: "should we have a 'core service' or something that feeds into everyting"): shared/liveCore.ts is the
 * Live core. The map's and Studio's card (LiveRoutePerformance) and the MCP's route_now (routeDirectionsNow) count each
 * direction's vehicles and the gaps between them there; route_now's stop-by-stop extras stay in shared/liveNow.ts. This guard:
 * - keeps Studio on the map's reading, never a copy of it;
 * - keeps the cut-offs both readings use equal to the one source (shared/rules/live.ts);
 * - lists every number the two readings type by hand. A new one fails here; a listed one that goes away fails too, so
 *   the list shrinks as CIV-3173 moves them into shared/rules/live.ts.
 */
const ROOT = join(import.meta.dirname, '..', '..');
const read = (f: string) => readFileSync(join(ROOT, f), 'utf8');

/** The files that work out a route's figures right now, for each of the three views. */
const RIGHT_NOW_FILES = [
  'shared/liveCore.ts',
  'shared/liveNow.ts',
  'scripts/mcp/liveNowTools.ts',
  'local-api/live-recent.ts',
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
  // How close together one vehicle's two passings of a stop count once (a trip id changing at a terminal).
  'shared/liveNow.ts': ['SAME_VEHICLE_SEC'],
  // The gap strip's rows (a layout count) and how far apart two reports may be to place a passing between them.
  'shared/liveCore.ts': ['STRIP_ROWS', 'MAX_BRACKET_SEC'],
  'src/apps/LiveVehicles.tsx': ['MIN_LIVE_ZOOM'],
  // How long the local server reuses a route's recorded half hour (a cache, not a figure).
  'local-api/live-recent.ts': ['CACHE_MS'],
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

  it('works out live gaps only in the core (and, until part 2, the card that calls it)', () => {
    expect(read('shared/liveCore.ts')).toMatch(/export function liveGaps\(/);
    expect(read('src/utils/livePerformance.ts')).toMatch(/^export \* from '\.\.\/\.\.\/shared\/liveCore';$/m);
    expect(read('src/utils/livePerformance.ts')).not.toMatch(/function /);
    const callers = RIGHT_NOW_FILES.filter(f => f !== 'shared/liveCore.ts' && /\bliveGaps\(/.test(read(f)));
    expect(callers).toEqual(['src/components/Live/LiveRoutePerformance.tsx']);
  });

  it("route_now reads each direction's vehicles and gaps from the core, from the same recordings as the card", () => {
    const tool = read('scripts/mcp/liveNowTools.ts');
    expect(tool).toMatch(/routeDirectionsNow\(/);
    expect(tool).toMatch(/recentFromSnapshots\(/);
    // The core gets each vehicle's direction as route_now placed it, never the feed's own field alone (TTC sends none,
    // so unlisted trips such as replacement buses were dropped and route_now counted fewer vehicles than the map).
    expect(tool).toMatch(/v\.d \?\? placedDir\.get\(v\.id\) \?\? inferLiveDirection\(/);
    // ...and places the rest with the map's own placement, which lives in the core (shared/liveDirection.ts) only.
    expect(read('src/utils/liveDirection.ts')).not.toMatch(/function /);
    expect(read('src/utils/liveResolveVehicles.ts')).toMatch(/inferLiveDirection/);
    expect(read('local-api/live-recent.ts')).toMatch(/recentFromSnapshots\(/);
  });

  it('both readings use the same cut-offs and window as shared/rules/live.ts', () => {
    expect(DEFAULT_CUTOFFS.bunchedWithinMin * 60).toBe(BUNCHED_GAP_SEC);
    expect(DEFAULT_CUTOFFS.gappedFactor).toBe(GAPPED_FACTOR);
    expect(RECENT_WINDOW_SEC).toBe(NOW_WINDOW_MIN * 60);
    // Both readings drop positions by the one stale age.
    expect(read('shared/liveNow.ts')).toMatch(/import \{[^}]*\bLIVE_STALE_SEC\b[^}]*\} from '\.\/rules\/live/);
    expect(read('shared/liveCore.ts')).toMatch(/import \{[^}]*\bLIVE_STALE_SEC\b[^}]*\} from '\.\/rules\/live/);
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

describe('Live coverage: one answer per agency (CIV-3173)', () => {
  it('reads vehicles and weekly figures from the core, never from its own list', async () => {
    const { liveAgencyCoverage } = await import('../../shared/liveCore');
    // YRT: vehicles on the map, no weekly figures; Kingston: weekly figures in Studio, never public vehicles (CIV-1716).
    expect(liveAgencyCoverage('yrt', ['ttc', 'kingston'])).toEqual({ hasVehicles: true, hasWeeklyFigures: false });
    expect(liveAgencyCoverage('kingston', ['ttc', 'kingston'])).toEqual({ hasVehicles: false, hasWeeklyFigures: true });
    expect(liveAgencyCoverage('ttc')).toEqual({ hasVehicles: true, hasWeeklyFigures: null });
  });
  it('the Worker and Studio\'s agency list take coverage from the core', () => {
    for (const f of ['workers/atlas-live-read/src/index.ts', 'local-api/live-studio-agencies.ts']) {
      const src = read(f);
      expect(src, f).toContain('liveAgencyCoverage(');
      expect(src, f).not.toContain('liveCloudServesVehicles');
    }
  });
});

describe('Live rows: gaps over the vehicles each row counts (#1958)', () => {
  it('the map and Studio hand the card their rows\' vehicles, and the card measures each row over them', () => {
    // TTC 504's analysis has one pattern per direction, so the pattern grouping put no vehicle on any row and rows with
    // 8 vehicles showed only the schedule. A row's gaps must come from the same vehicles as its count.
    for (const f of ['src/apps/LiveVehicles.tsx', 'src/apps/studio/RouteRightNow.tsx']) expect(read(f), f).toMatch(/rowVehicles=\{/);
    const card = read('src/components/Live/LiveRoutePerformance.tsx');
    expect(card).toMatch(/rowVehicles!?\.get\(/);
    expect(card).toContain('rowVehicles={rowVehicles}');
  });
});
