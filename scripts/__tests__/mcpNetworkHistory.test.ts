import { describe, expect, it } from 'vitest';
import type { McpHistoryAgency } from '../../shared/mcpStore';

// CIV-3206: network_history counts an agency's routes at a frequency in each History year, as History's year view does.
const snap = (label: string, year: number, midday: number | null, extra: Record<string, unknown> = {}) => ({ label, year, weekdayHeadwayMin: midday, headwayByPeriod: { amPeak: midday, midday, pmPeak: midday, evening: null, late: null, overnight: null }, ...extra });
const history: McpHistoryAgency[] = [{
  slug: 'fx', coverageYears: [2019, 2021, 2024],
  routes: [
    // Every 10 throughout: counted at 10 each year.
    { routeShortName: '1', routeName: 'King', snapshots: [snap('Sep 2019', 2019, 10), snap('Sep 2021', 2021, 10), snap('Sep 2024', 2024, 8)] },
    // Cut from 10 to 20 in 2021.
    { routeShortName: '2', routeName: 'Queen', snapshots: [snap('Sep 2019', 2019, 10), snap('Sep 2021', 2021, 20), snap('Sep 2024', 2024, 20)] },
    // Old snapshots only (v1): 2021 has none, so History carries 2019's into it.
    { routeShortName: '3', routeName: 'Dundas', snapshots: [snap('Sep 2019', 2019, 12), snap('Sep 2024', 2024, 15)] },
    // A doubtful old figure (#1580): every 2 min in 2019 on a route that runs every 30 now.
    { routeShortName: '4', routeName: 'Bay', snapshots: [snap('Sep 2019', 2019, 2), snap('Sep 2024', 2024, 30)] },
  ],
}];

async function handlers() {
  const data = await import('../mcp/atlasData');
  const { memoryStore } = await import('../../shared/mcpMemoryStore');
  data.useStore(memoryStore({ catalog: [{ slug: 'fx', name: 'Fixture Transit', region: 'Ontario', lastFeedExpiry: '20271231' }] as never, meta: { fx: { shortName: 'FX', parentAgency: null } }, files: { fx: [] }, history }));
  return (await import('../mcp/tools')).handlers;
}

describe('network_history (CIV-3206)', () => {
  it("counts each year's routes every N min or better in the part of the day, by History's limit", async () => {
    const h = await handlers();
    const res = await h.network_history({ agency: 'Fixture Transit', period: 'Midday', every: 10 }) as { yearsWithHistory: number[]; years: Array<{ year: number; routesMeeting: number; routes: string[]; routesRunning: number; notCountedDoubtful?: string[] }> };
    expect(res.yearsWithHistory).toEqual([2019, 2021, 2024]);
    expect(res.years.map(y => [y.year, y.routes])).toEqual([[2019, ['1', '2']], [2021, ['1']], [2024, ['1']]]);
    expect(res.years[0].routesRunning).toBe(4);
    // The 2019 "every 2 min" on route 4 is left out and named.
    expect(res.years[0].notCountedDoubtful).toEqual(['4: every 2 min']);
  });
  it("names a route whose figure is carried from an older schedule, as History's year view carries it", async () => {
    const h = await handlers();
    const res = await h.network_history({ agency: 'Fixture Transit', period: 'Midday', every: 15 }) as { years: Array<{ year: number; routes: string[]; carriedFromOlderSchedule?: string[] }> };
    const y2021 = res.years.find(y => y.year === 2021)!;
    expect(y2021.routes).toEqual(['1', '3']);
    expect(y2021.carriedFromOlderSchedule).toEqual(['3 (2019)']);
  });
  it('says the agency has no figures for a day its old schedules never stored, rather than counting zero routes', async () => {
    const h = await handlers();
    expect(await h.network_history({ agency: 'Fixture Transit', period: 'Midday', every: 10, day: 'Saturday' })).toMatchObject({ history: null, yearsWithHistory: [2019, 2021, 2024], note: expect.stringMatching(/no Saturday figures.*it has Weekday ones/) });
  });
  it('says when History has no data for the agency', async () => {
    const data = await import('../mcp/atlasData');
    const { memoryStore } = await import('../../shared/mcpMemoryStore');
    data.useStore(memoryStore({ catalog: [{ slug: 'fx', name: 'Fixture Transit', region: 'Ontario', lastFeedExpiry: '20271231' }] as never, files: { fx: [] } }));
    const { handlers: h } = await import('../mcp/tools');
    expect(await h.network_history({ agency: 'Fixture Transit', period: 'Midday', every: 10 })).toMatchObject({ history: null });
  });
});

describe('network_history on a day History has no figures for (CIV-3206)', () => {
  it("says so for the agency, rather than zero routes every year (TTC Sundays store only an all-day figure)", async () => {
    const sunOnlyAllDay = { label: 'Sep 2024', year: 2024, weekdayHeadwayMin: 10, headwayByPeriod: { midday: 10 }, v2: { refDate: '20240904', rep: { h: 10, p: { midday: 10 } }, sun: { h: 12 } } };
    const noSunday = { ...sunOnlyAllDay, v2: { ...sunOnlyAllDay.v2, sun: { none: true } } };
    const data = await import('../mcp/atlasData');
    const { memoryStore } = await import('../../shared/mcpMemoryStore');
    data.useStore(memoryStore({ catalog: [{ slug: 'fx', name: 'Fixture Transit', region: 'Ontario', lastFeedExpiry: '20271231' }] as never, files: { fx: [] }, history: [{ slug: 'fx', routes: [{ routeShortName: '1', snapshots: [sunOnlyAllDay] }, { routeShortName: '2', snapshots: [noSunday] }] }] as never }));
    const { handlers: h } = await import('../mcp/tools');
    expect(await h.network_history({ agency: 'Fixture Transit', period: 'Evening', every: 15, day: 'Sunday' })).toMatchObject({ history: null, note: expect.stringMatching(/no Sunday figures by part of the day/) });
  });
});

describe('network_history on a release built before it (CIV-3206)', () => {
  it("says the network view isn't published yet when History has the agency's routes but no network file", async () => {
    const data = await import('../mcp/atlasData');
    const { memoryStore } = await import('../../shared/mcpMemoryStore');
    const base = memoryStore({ catalog: [{ slug: 'fx', name: 'Fixture Transit', region: 'Ontario', lastFeedExpiry: '20271231' }] as never, files: { fx: [] }, history });
    data.useStore({ ...base, historyNetwork: async () => null });
    const { handlers: h } = await import('../mcp/tools');
    expect(await h.network_history({ agency: 'Fixture Transit', period: 'Midday', every: 10 })).toMatchObject({ history: null, note: expect.stringMatching(/isn't published yet/) });
  });
});
