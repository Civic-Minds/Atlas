import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { computePeriodCoverageHeadways, computePeriodHeadways, computePeriodMaxGaps, isSparseOvernightWindow, periodHeadwayInWindow, sparseOvernightHeadway } from '../headway-utils';
import { decidePeriod } from '../routeGrading';
import { overnightPeriodValues } from '../overnightTerminal';
import { processGtfsBuffer } from '../process-core';

const at = (...hhmm: string[]) => hhmm.map(t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; });

function hm(mins: number): string {
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}:00`;
}

/** One weekday route, every 10 minutes 07:00-19:00, plus the given overnight departures. */
async function feed(overnight: number[]): Promise<Buffer> {
  const zip = new JSZip();
  zip.file('agency.txt', 'agency_id,agency_name,agency_url,agency_timezone\na,Fixture Transit,https://example.test,America/Toronto\n');
  zip.file('routes.txt', 'route_id,route_short_name,route_long_name,route_type\nr1,9,Nine,3\n');
  zip.file('stops.txt', 'stop_id,stop_name,stop_lat,stop_lon\ns1,First,43.65,-79.40\ns2,Last,43.67,-79.38\n');
  zip.file('calendar.txt', 'service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\nweekday,1,1,1,1,1,0,0,20260101,20271231\n');
  zip.file('shapes.txt', 'shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence\nsh,43.65,-79.40,1\nsh,43.66,-79.39,2\nsh,43.67,-79.38,3\n');
  const trips = ['route_id,service_id,trip_id,trip_headsign,direction_id,shape_id'];
  const stopTimes = ['trip_id,arrival_time,departure_time,stop_id,stop_sequence'];
  const starts = [...Array.from({ length: 73 }, (_, i) => 7 * 60 + i * 10), ...overnight];
  for (const start of starts) {
    trips.push(`r1,weekday,t${start},Last,0,sh`);
    stopTimes.push(`t${start},${hm(start)},${hm(start)},s1,1`, `t${start},${hm(start + 12)},${hm(start + 12)},s2,2`);
  }
  zip.file('trips.txt', trips.join('\n') + '\n');
  zip.file('stop_times.txt', stopTimes.join('\n') + '\n');
  return zip.generateAsync({ type: 'nodebuffer' });
}

async function route(overnight: number[]) {
  const result = await processGtfsBuffer(await feed(overnight), undefined, { slug: 'fixture' });
  return JSON.parse(result.geojson).features
    .map((f: any) => f.properties)
    .find((p: any) => p.routeId === 'r1' && p.day === 'Weekday' && p.stopId == null);
}

// #897: three overnight departures around a hole of hours read the mean of the two gaps
// (TTC 504 weekday 116, CTA 55 Sunday 105), a wait no rider sees.
describe('sparse overnight window (#897)', () => {
  it('flags three departures whose two gaps the shared steadiness test calls uneven', () => {
    // A close pair, then a hole: 10 and 170.
    expect(isSparseOvernightWindow(at('26:00', '26:10', '29:00'))).toBe(true);
    // Plain notation counts the same as extended notation.
    expect(isSparseOvernightWindow(at('02:00', '02:10', '05:00'))).toBe(true);
    // TTC 504 weekday at King & John: 02:00-02:40 every 5, then nothing until 05:29; a three-trip
    // tail of that shape (5 then 169).
    expect(isSparseOvernightWindow(at('26:35', '26:40', '29:29'))).toBe(true);
  });

  it('keeps TTC 300 weekday\'s short turn to Victoria Park at 10 (gaps 15 and 4 are steady)', () => {
    const times = at('04:38', '04:53', '04:57');
    expect(isSparseOvernightWindow(times)).toBe(false);
    expect(computePeriodHeadways(times).overnight).toBe(10);
  });

  it('follows the settled steadiness thresholds, not a new ratio or clock floor', () => {
    // 20 and 80: mean 50, longest 80 is 1.6x it, under 1.7x: steady, keeps 50.
    expect(isSparseOvernightWindow(at('26:00', '26:20', '27:40'))).toBe(false);
    expect(periodHeadwayInWindow(at('26:00', '26:20', '27:40'), 'overnight')).toBe(50);
    // 10 and 60: mean 35, longest 60 is 25 over and 1.71x: uneven.
    expect(isSparseOvernightWindow(at('26:00', '26:10', '27:10'))).toBe(true);
    // 2 and 20: 1.82x but only 9 minutes over the mean: steady.
    expect(isSparseOvernightWindow(at('26:00', '26:02', '26:22'))).toBe(false);
  });

  it('leaves even, two-, four-departure and daytime windows alone', () => {
    expect(isSparseOvernightWindow(at('26:00', '27:00', '28:00'))).toBe(false);
    expect(isSparseOvernightWindow(at('26:00', '26:10', '26:20', '29:00'))).toBe(false);
    expect(isSparseOvernightWindow(at('26:00', '29:00'))).toBe(false);
    // The same shape at midday is not an overnight window and keeps its value.
    expect(isSparseOvernightWindow(at('10:00', '10:10', '13:00'))).toBe(false);
    expect(computePeriodHeadways(at('10:00', '10:10', '13:00')).midday).toBe(90);
  });

  it('reads no overnight value but keeps coverage and max gap', () => {
    const times = at('26:00', '26:10', '29:00');
    expect(computePeriodHeadways(times).overnight).toBeNull();
    expect(computePeriodCoverageHeadways(times).overnight).toBeGreaterThanOrEqual(170);
    expect(computePeriodMaxGaps(times).overnight).toBe(170);
  });

  it('applies to the night-route overnight override (#896)', () => {
    const values = overnightPeriodValues(at('26:00', '26:10', '29:00'));
    expect(values.headway).toBeNull();
    expect(values.withheld).toBe(90);
    expect(values.maxGap).toBe(170);
  });

  it('withholds the value of a sparse window and only of a sparse window', () => {
    expect(sparseOvernightHeadway(at('26:00', '26:10', '29:00'))).toBe(90);
    expect(sparseOvernightHeadway(at('04:38', '04:53', '04:57'))).toBeNull();
  });

  it('withholds a period whose source is sparse without handing it to another source', () => {
    const base = {
      terminalIsBranchScoped: true, worstDrawnStop: null, terminalCoverage: 180, branchCoverage: 60,
      hasScopedTimes: true, termMaxGap: 170, branchMaxGap: 40, termSustained: false, branchSustained: true,
    };
    // TTC 504 weekday shape: the terminal's sparse 116 is picked over the branch's 10, then withheld.
    const sparseTerm = decidePeriod({ ...base, termH: 116, branchH: 10, termSparse: true });
    expect(sparseTerm.headway).toBeNull();
    expect(sparseTerm.withheld).toBe(116);
    expect(sparseTerm.coverage).toBe(180);
    expect(sparseTerm.maxGap).toBe(170);
    expect(sparseTerm.sustained).toBe(false);
    // A steady terminal value stands, and a sparse branch the terminal beat changes nothing.
    expect(decidePeriod({ ...base, termH: 30, branchH: 90, branchSparse: true }).headway).toBe(30);
    // An unscoped terminal under a slower sparse branch: the branch is picked, then withheld.
    const sparseBranch = decidePeriod({ ...base, terminalIsBranchScoped: false, termH: 30, branchH: 90, branchSparse: true });
    expect(sparseBranch.headway).toBeNull();
    expect(sparseBranch.maxGap).toBe(40);
    // A worst drawn stop that is sparse floors the period and is withheld with it.
    const worst = { headway: 120, coverage: 200, maxGap: 190, sustained: false, sparse: true };
    const floored = decidePeriod({ ...base, terminalIsBranchScoped: false, termH: 30, branchH: null, worstDrawnStop: worst });
    expect(floored.headway).toBeNull();
    expect(floored.coverage).toBe(200);
  });

  it('nulls the route and stop overnight values, keeping coverage, max gap and daytime values', async () => {
    const p = await route(at('26:00', '26:10', '29:00'));
    expect(p.headwayByPeriod.overnight).toBeNull();
    // The unsteady flag stays, so the route-wide coverage stamp picks the same patterns.
    expect(p.headwayByPeriodSustained?.overnight).toBe(false);
    expect(p.worstDirectionPeriodCoverageHeadway.overnight).toBeGreaterThanOrEqual(170);
    expect(p.periodCoverageHeadway.overnight).toBeGreaterThanOrEqual(170);
    expect(p.maxGapByPeriod.overnight).toBe(170);
    expect(p.headwayByPeriod.midday).toBe(10);
    // The stop card reads the same: no stop shows the mean the route row dropped.
    for (const stop of Object.values(p.stopPeriodHeadways as Record<string, Record<string, number>>)) {
      expect(stop.overnight).toBeUndefined();
      expect(stop.midday).toBe(10);
    }
  });

  it('keeps an evenly spaced overnight route at route and stop', async () => {
    const p = await route(at('26:00', '27:00', '28:00'));
    expect(p.headwayByPeriod.overnight).toBe(60);
    expect(p.headwayByPeriod.midday).toBe(10);
    expect(p.stopPeriodHeadways.s1.overnight).toBe(60);
  });

  it('keeps a steady three-trip overnight short turn at route and stop (TTC 300 shape)', async () => {
    const p = await route(at('04:38', '04:53', '04:57'));
    expect(p.headwayByPeriod.overnight).toBe(10);
    expect(p.stopPeriodHeadways.s1.overnight).toBe(10);
  });
});
