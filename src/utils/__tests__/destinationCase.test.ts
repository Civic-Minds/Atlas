import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { feedPlaceName } from '../nameCase';
import { riderHeadsign, routeDirectionLabels } from '../liveGrouping';
import { clearLiveDashboardCache, fetchLiveDashboard } from '../../lib/liveDashboardFetch';

// CIV-2915 (Ryan, 2026-11-25, on Live's Hamilton list: "Is this font different", then "1"): destinations a feed sends in
// capitals read in normal case for every agency, everywhere they show, keeping known short forms (GO, TTC, LRT) in capitals.
// One formatter (feedPlaceName) and one list of kept short forms (NAME_ACRONYMS in nameCase.ts).
describe('destinations in normal case (CIV-2915)', () => {
  afterEach(() => { vi.unstubAllGlobals(); clearLiveDashboardCache(); });

  it('the shared formatter cases capitals and keeps the short forms', () => {
    expect(feedPlaceName('HAMILTON GO CENTRE')).toBe('Hamilton GO Centre');
    expect(feedPlaceName('WEST HAMILTON LOOP via MCMASTER UNIVERSITY')).toBe('West Hamilton Loop via McMaster University');
    expect(feedPlaceName('UNION STATION TTC')).toBe('Union Station TTC');
    expect(feedPlaceName('LRT STATION')).toBe('LRT Station');
    // A name the feed already wrote in mixed case stays exactly as written.
    expect(feedPlaceName('Eastgate Terminal')).toBe('Eastgate Terminal');
  });

  it("Live's vehicle list and card read the trip's destination through it", () => {
    expect(riderHeadsign('HAMILTON GO CENTRE', '1')).toBe('Hamilton GO Centre');
    expect(riderHeadsign('1 KING SHORT TURN', '1')).toBeNull();
  });

  it("Live's direction names from the route's shapes read through it", () => {
    const f = (dir: number, headsign: string, coords: [number, number][]) => ({ type: 'Feature' as const, properties: { routeShortName: '1', directionId: dir, headsign }, geometry: { type: 'LineString' as const, coordinates: coords } });
    const labels = routeDirectionLabels([f(1, 'HAMILTON GO CENTRE', [[0, 0], [0.1, 0]]), f(0, 'EASTGATE SQUARE', [[0, 0], [0.1, 0]])], '1');
    expect(labels.get(1)).toBe('Hamilton GO Centre');
    expect(labels.get(0)).toBe('Eastgate Square');
  });

  it("a Live route file's direction names read through it, for every Live surface", async () => {
    const file = { status: 'ready', agency: 'hamilton', route: '1', v3: { directionLabels: { 0: 'To EASTGATE SQUARE', 1: 'To HAMILTON GO CENTRE' } } };
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, headers: new Headers({ 'content-type': 'application/json' }), json: async () => file })));
    const data = await fetchLiveDashboard('hamilton', '1');
    if (data.status !== 'ready') throw new Error('not ready');
    expect(data.v3.directionLabels).toEqual({ 0: 'To Eastgate Square', 1: 'To Hamilton GO Centre' });
  });

  it("the MCP's destinations and end stops read through it", () => {
    const mcp = readFileSync(resolve(__dirname, '../../../scripts/mcp/atlasData.ts'), 'utf8');
    expect(mcp).toMatch(/const towardsOf = \(row: ShapeProperties\) => placeOrNull\(/);
    expect(mcp).toMatch(/towards: placeOrNull\(b\.towards\)/);
    expect(mcp).toMatch(/to: placeOrNull\(b\.to\)/);
    expect(mcp).toMatch(/towards: placeOrNull\(b\.headsign\)/);
    expect(readFileSync(resolve(__dirname, '../../../scripts/mcp/localTools.ts'), 'utf8')).toMatch(/towards: s\.towards\.map\(feedPlaceName\)/);
  });
});
