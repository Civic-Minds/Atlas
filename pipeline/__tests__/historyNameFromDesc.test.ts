// CIV-1485: King County Metro publishes no route_long_name, only the number and route_desc. With the agency's
// historyNameFromDesc, the History sidecar keeps route_desc as `desc` so the reused-number test has a name to compare.
import { describe, expect, it } from 'vitest';
import { computeFeedEvidence } from '../historyWeekend.js';
import { buildV2Routes, descForKey } from '../historyV2.js';
import { splitRouteHistory } from '../historyRouteIdentity.js';

const REF = '20240612';
const cal = { service_id: 'WK', monday: '1', tuesday: '1', wednesday: '1', thursday: '1', friday: '1', saturday: '0', sunday: '0', start_date: '20240101', end_date: '20241231' };
const rows = (routes: Array<{ route_id: string; route_short_name?: string; route_long_name?: string; route_desc?: string }>) => ({
  calendar: [cal], calendarDates: [], trips: routes.map(r => ({ route_id: r.route_id, service_id: 'WK' })), routes,
});
const f = (p: Record<string, unknown>) => ({ properties: { day: 'Weekday', routeAllDayHeadway: 15, ...p } });
const kcm = rows([
  { route_id: '100', route_short_name: '61', route_long_name: '', route_desc: 'Lake City - Northgate - Greenwood' },
  { route_id: '101', route_short_name: '7', route_long_name: '', route_desc: 'Route 7' },
  { route_id: '102', route_short_name: '28', route_long_name: 'Broadview Line', route_desc: 'Whittier Heights - Fremont - Downtown Seattle' },
  { route_id: '103', route_short_name: '44', route_long_name: '44', route_desc: 'Ballard - University District' },
]);
const features = [
  f({ routeShortName: '61', routeId: '100', routeLongName: '' }),
  f({ routeShortName: '7', routeId: '101', routeLongName: '' }),
  f({ routeShortName: '28', routeId: '102', routeLongName: 'Broadview Line' }),
  f({ routeShortName: '44', routeId: '103', routeLongName: '44' }),
];

describe('historyNameFromDesc (CIV-1485)', () => {
  it('off (every other agency): no description is read and the sidecar routes are unchanged', () => {
    const ev = computeFeedEvidence(kcm, { referenceDate: REF });
    expect(ev.descByKey).toBeUndefined();
    const off = buildV2Routes(features, ev).routes;
    expect(Object.values(off).some(r => 'desc' in r)).toBe(false);
    // Asking the evidence for descriptions without the option leaves the routes byte-identical too.
    expect(JSON.stringify(buildV2Routes(features, computeFeedEvidence(kcm, { referenceDate: REF, routeDesc: true })).routes)).toBe(JSON.stringify(off));
  });

  it('on: a route with no long name, or one that is only its number, keeps route_desc; the shown name is untouched', () => {
    const ev = computeFeedEvidence(kcm, { referenceDate: REF, routeDesc: true });
    const out = buildV2Routes(features, ev, { nameFromDesc: true }).routes;
    expect(out['61']).toMatchObject({ name: '61', desc: 'Lake City - Northgate - Greenwood' });
    expect(out['44']).toMatchObject({ name: '44', desc: 'Ballard - University District' });
    // A real long name wins; a description that is only the number ("Route 7") is no name.
    expect(out['28'].desc).toBeUndefined();
    expect(out['28'].name).toBe('Broadview Line');
    expect(out['7'].desc).toBeUndefined();
  });

  it('descForKey: blank evidence or no description gives nothing', () => {
    expect(descForKey('61', '', undefined)).toBeUndefined();
    expect(descForKey('61', undefined, computeFeedEvidence(rows([{ route_id: '1', route_short_name: '61' }]), { referenceDate: REF, routeDesc: true }))).toBeUndefined();
  });

  it('the reused-number test reads the description: KCM 61 (Ballard loop, then Lake City) splits, a same-line restyle does not', () => {
    const ballard = [[-122.38, 47.66], [-122.39, 47.69]];
    const lakeCity = [[-122.30, 47.72], [-122.35, 47.70]];
    const p = (periodKey: string, year: number, name: string, line: number[][]) => ({ periodKey, sortKey: periodKey, year, name, line, termini: null });
    expect(splitRouteHistory([p('20131016', 2013, 'Ballard - North Beach Loop', ballard), p('20250910', 2025, 'Lake City - Northgate - Greenwood', lakeCity)], '61').splits).toHaveLength(1);
    // Without the description both periods are only "61": no name change, so no split.
    expect(splitRouteHistory([p('20131016', 2013, '61', ballard), p('20250910', 2025, '61', lakeCity)], '61').splits).toHaveLength(0);
  });
});
