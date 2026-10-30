import { describe, expect, it } from 'vitest';
import { routeCardRowValue } from '../routeCardRowValue';
import type { ShapeProperties } from '../../hooks/useIntervalStats';

const ctx = { period: 'midday' as const, hoveredHour: null, stretchMode: false, noRegularService: false, maxHeadway: Infinity };

describe('routeCardRowValue (CIV-992)', () => {
  it('shows a steady row its own cadence, coloured by the filter value', () => {
    const d = { routeId: 'r', routeShortName: '1', routeLongName: '', directionId: 0, headsign: 'A', tier: '10', headway: 10, headwayByPeriod: { midday: 10 } } as unknown as ShapeProperties;
    const row = routeCardRowValue(d, ctx);
    expect(row.headway).toBe(10);
    expect(row.isLimited).toBe(false);
    expect(row.dimmed).toBe(false);
  });
  it('reads as the route does when the route has no regular service on All day', () => {
    const d = { routeId: 'r', routeShortName: '1', routeLongName: '', directionId: 0, headsign: 'A', tier: '10', headway: 10 } as unknown as ShapeProperties;
    const row = routeCardRowValue(d, { ...ctx, period: 'all', noRegularService: true });
    expect(row.rowNoRegular).toBe(true);
    expect(row.headway).toBeUndefined();
    expect(row.isLimited).toBe(true);
  });

  // #1142 (CIV-1018): TTC 320 southbound, weekday overnight: every 5 from 2:00 to 3:20, then every 15 or more.
  const uneven = (role: 'main' | 'tail', typical: number | null) => ({
    routeId: '320', routeShortName: '320', routeLongName: 'Yonge', directionId: 0, headsign: 'Queens Quay', tier: '10',
    headway: 7, headwayByPeriod: { overnight: 7 }, stretchRole: role, stretchIndex: 0,
    stretchPeriodHeadway: { overnight: 18 }, stretchPeriodTypical: { overnight: typical },
  }) as unknown as ShapeProperties;
  const overnight = { ...ctx, period: 'overnight' as const, stretchMode: true };

  it("reads an uneven period's main row as typical to worst, its number the worst wait", () => {
    const row = routeCardRowValue(uneven('main', 5), overnight);
    expect(row.headway).toBe(18);
    expect(row.headwayLabel).toBe('every 5–18 min');
  });
  it('leaves a steady period, a tail and the hovered hour as they were', () => {
    expect(routeCardRowValue(uneven('main', null), overnight).headwayLabel).toBeUndefined();
    expect(routeCardRowValue(uneven('tail', 5), overnight).headwayLabel).toBeUndefined();
    expect(routeCardRowValue(uneven('main', 5), { ...overnight, hoveredHour: 2 }).headwayLabel).toBeUndefined();
  });
  // CIV-1156: SEPTA 67 northbound, weekday evening. The infrequent guard drops the row's own 30 (longest gap 50), and the
  // direction's value is the Philadelphia Mills tail's 169; the main stretch runs every 25, longest gap 30.
  const septa67 = (over: Record<string, unknown> = {}) => ({
    routeId: '67', routeShortName: '67', routeLongName: '', directionId: 1, headsign: 'Frankford Transit Center', tier: 'infrequent',
    headway: 60, headwayByPeriod: { evening: 30 }, maxGapByPeriod: { evening: 50 }, stretchRole: 'main', stretchIndex: 0,
    directionFilterHeadwayByPeriod: { evening: 169 },
    stretchMeta: { main: { stops: 40, refStop: 's', trips: 60, period: { evening: 25 }, maxGap: { evening: 30 } }, tails: [] },
    ...over,
  }) as unknown as ShapeProperties;
  const evening = { ...ctx, period: 'evening' as const, stretchMode: true };

  it("shows a main row the main stretch's own value when the direction's value is longer than its longest gap (CIV-1156)", () => {
    const row = routeCardRowValue(septa67(), evening);
    expect(row.headway).toBe(25);
    expect(row.isLimited).toBe(false);
    expect(row.rowNoRegular).toBe(false);
  });
  it('leaves the direction value where it is within the main gap, on a tail, or where the guard did not drop the row (CIV-1156)', () => {
    expect(routeCardRowValue(septa67({ directionFilterHeadwayByPeriod: { evening: 30 } }), evening).headway).toBe(30);
    expect(routeCardRowValue(septa67({ tier: 'span', headway: null, headwayByPeriod: {} }), evening).headway).toBe(169);
    expect(routeCardRowValue(septa67({ stretchRole: 'variant' }), evening).headway).toBe(169);
  });
  it('keeps a row that already reads a range (CIV-1156: TTC 17 to Warden, every 10–30; the Markham stops get every 27–30)', () => {
    const ttc17 = septa67({ routeShortName: '17', headsign: 'Warden', headwayByPeriod: { amPeak: 10 }, maxGapByPeriod: { amPeak: 21 },
      directionFilterHeadwayByPeriod: { amPeak: 30 },
      stretchMeta: { main: { stops: 40, refStop: 's', trips: 60, period: { amPeak: 10 }, maxGap: { amPeak: 12 } }, tails: [] } });
    const row = routeCardRowValue(ttc17, { ...ctx, period: 'amPeak', stretchMode: true, contract: { filterValue: 30, runs: true, range: [10, 30] } });
    expect(row.headway).toBe(30);
    expect(row.headwayLabel).toBe('every 10–30 min');
  });
});
