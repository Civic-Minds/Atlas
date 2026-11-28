import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { renameRoutes, type RouteRename } from '../route-renames';
import type { GtfsData } from '../../../types/gtfs';

const gtfs = (routes: Array<[string, string, string]>) =>
  ({ routes: routes.map(([route_id, route_short_name, route_long_name]) => ({ route_id, route_short_name, route_long_name, route_type: 3 })) }) as unknown as GtfsData;
const config = (slug: string) => JSON.parse(readFileSync(new URL(`../../../config/agencies/${slug}.json`, import.meta.url), 'utf8')) as { routeRenames: RouteRename[] };

describe('hand-checked route name fixes (CIV-2237)', () => {
  it('takes LakeXpress\'s number out of the long name where the short name is "Route", and leaves other routes alone', () => {
    const renames: RouteRename[] = [{ routeId: '4', from: { shortName: 'Route', longName: '4 Altoona to Zellwood' }, to: { shortName: '4', longName: 'Altoona to Zellwood' } }];
    const out = renameRoutes(gtfs([['4', 'Route', '4 Altoona to Zellwood'], ['27', '27', 'Express Leesburg to Clermont']]), renames);
    expect(out.gtfs.routes.map(r => [r.route_short_name, r.route_long_name])).toEqual([['4', 'Altoona to Zellwood'], ['27', 'Express Leesburg to Clermont']]);
    expect(out.renamed).toBe(1);
    expect(out.stale).toEqual([]);
  });

  it('leaves a route as published once the feed no longer gives the listed names, and reports the entry as stale', () => {
    const renames: RouteRename[] = [{ routeId: '4', from: { shortName: 'Route', longName: '4 Altoona to Zellwood' }, to: { shortName: '4', longName: 'Altoona to Zellwood' } }];
    const out = renameRoutes(gtfs([['4', '4', 'Altoona to Zellwood']]), renames);
    expect(out.gtfs.routes[0].route_short_name).toBe('4');
    expect(out.renamed).toBe(0);
    expect(out.stale.map(r => r.routeId)).toEqual(['4']);
  });

  it('each agency lists one entry per route, and names only from the feed', () => {
    for (const slug of ['danville-va', 'lakexpress', 'stjoseph-mo']) {
      const { routeRenames } = config(slug);
      const ids = routeRenames.map(r => r.routeId);
      expect(new Set(ids).size).toBe(ids.length);
      for (const r of routeRenames) expect(`${r.from.shortName} ${r.from.longName}`).toContain(r.to.shortName);
    }
  });

  it('Danville: a bus number\'s two loops read as their own lines, and the two buses on one loop read as one line', () => {
    const { routeRenames } = config('danville-va');
    const lines = new Map<string, string[]>();
    for (const r of routeRenames) lines.set(r.to.shortName, [...(lines.get(r.to.shortName) ?? []), r.from.shortName]);
    expect(lines.get('North Main')).toEqual(expect.arrayContaining(['1', '4']));
    expect(lines.get('Kemper Road - DCC')).toEqual(['1']);
  });

  it('St. Joseph: every run of a line reads as the line', () => {
    const { routeRenames } = config('stjoseph-mo');
    const run = (sn: string) => routeRenames.find(r => r.from.shortName === sn)?.to.shortName;
    expect([run('1 A'), run('1 C SAT'), run('2/7 B'), run('5/8 D SAT')]).toEqual(['1', '1', '2/7', '5/8']);
  });
});
