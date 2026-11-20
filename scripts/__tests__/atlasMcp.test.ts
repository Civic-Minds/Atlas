import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { hourlyFrequency, edgeWait, frequencyChanges, parseClock, parseDay, parsePeriod, periodsIn, publicAgencies, useStore } from '../mcp/atlasData';
import { agencyLabel, withAgency } from '../mcp/localData';
import { diskStore } from '../mcp/diskStore';
import { startsInWindow, windowHas } from '../mcp/tools';
import { stopToStopRuns } from '../../pipeline/stopToStop';
import type { GtfsData } from '../../types/gtfs';
import type { StudioBeforeAfterFile } from '../../shared/studioBeforeAfter';

useStore(diskStore());

describe('Atlas MCP server data (CIV-1650)', () => {
  it('reads days and periods by the shared names', () => {
    expect([parseDay('saturday'), parseDay(undefined), parseDay('nonsense')]).toEqual(['Saturday', 'Weekday', 'Weekday']);
    expect([parsePeriod('Midday'), parsePeriod('AM peak'), parsePeriod('pm_peak'), parsePeriod('lunch')]).toEqual(['midday', 'amPeak', 'pmPeak', null]);
  });

  it('answers only for public agencies', async () => {
    const agencies = await publicAgencies();
    expect(agencies.length).toBeGreaterThan(100);
    expect(agencies.some(a => a.betaOnly)).toBe(false);
  });

  it('lists schedule changes by the shared rule: a move inside a grade is none (Hamilton 44, 30 → 29)', () => {
    const day = (midday: number | null) => ({ headway: { midday }, trips: 0, first: null, last: null, runMinutes: [] });
    const file = { changes: [
      { route: '44', name: null, before: day(30), after: day(29), size: 'small' },
      { route: '1', name: null, before: day(30), after: day(15), size: 'frequency' },
      { route: '2', name: null, before: null, after: day(20), size: 'frequency' },
    ] } as unknown as StudioBeforeAfterFile;
    expect(frequencyChanges(file).map(c => [c.route, c.steps])).toEqual([['2', 8], ['1', 2]]);
  });

  it('reads clock times and names the Atlas periods a window overlaps', () => {
    expect(['10:00', '10 AM', '6 PM', '6:30 pm', '12 AM', 'noon'].map(parseClock)).toEqual([600, 600, 1080, 1110, 0, null]);
    expect(periodsIn(600, 1080)).toEqual(['Midday (9 AM–3 PM)', 'PM peak (3–7 PM)']);
  });

  it('times trips from one stop to a later one, matching a stop by its station, on the day read', () => {
    const day = { monday: '1', tuesday: '1', wednesday: '1', thursday: '1', friday: '1', saturday: '1', sunday: '1' };
    const st = (trip: string, stop: string, seq: number, time: string) => ({ trip_id: trip, stop_id: stop, stop_sequence: String(seq), arrival_time: time, departure_time: time });
    const gtfs = {
      routes: [{ route_id: 'r', route_short_name: '9' }],
      trips: [{ trip_id: 't1', route_id: 'r', service_id: 's' }, { trip_id: 't2', route_id: 'r', service_id: 's' }, { trip_id: 'back', route_id: 'r', service_id: 's' }],
      stops: [{ stop_id: 'A1', stop_name: 'A platform', parent_station: 'A' }, { stop_id: 'B', stop_name: 'B' }],
      stopTimes: [st('t1', 'A1', 1, '10:00:00'), st('t1', 'B', 2, '10:30:00'), st('t2', 'A1', 1, '10:20:00'), st('t2', 'B', 2, '10:45:00'), st('back', 'B', 1, '11:00:00'), st('back', 'A1', 2, '11:30:00')],
      calendar: [{ service_id: 's', ...day, start_date: '20260101', end_date: '20271231' }],
      calendarDates: [],
    } as unknown as GtfsData;
    const { runs } = stopToStopRuns(gtfs, new Set(['A']), new Set(['B']), 'Saturday');
    expect(runs.map(r => [r.tripId, r.start, r.minutes]).sort()).toEqual([['t1', 600, 30], ['t2', 620, 25]]);
  });
});

describe('edgeWait', () => {
  it('marks a wait counted to the period edge', () => {
    expect(edgeWait('every 10 min until 12:59 AM on part of the route', 61)).toBe(true);
    expect(edgeWait('every 10 min', 10)).toBe(false);
    expect(edgeWait('every 5–10 min', 10)).toBe(false);
    expect(edgeWait('every 10 min until 12:59 AM', 10)).toBe(false);
  });
});

describe('agency labels for trips across agencies', () => {
  it('shortens a name and does not repeat a word', () => {
    expect(agencyLabel('no-such-agency', 'Los Angeles County Metropolitan Transportation Authority (LA Metro)')).toBe('LA Metro');
    expect(agencyLabel('no-such-agency', 'Big Blue Bus (Santa Monica)')).toBe('Big Blue Bus');
    expect(withAgency('LA Metro', 'Metro E Line')).toBe('LA Metro E Line');
    expect(withAgency('Big Blue Bus', 'R10')).toBe('Big Blue Bus R10');
  });
});

describe('time windows that start after midnight (CIV-1840)', () => {
  it('reads 12 AM–3 AM as the late night of the service day (24:00–27:00) as well as the clock hours', () => {
    const w = { start: parseClock('12 AM')!, end: parseClock('3 AM')! };
    expect(w).toEqual({ start: 0, end: 180 });
    expect([100, 1500, 1600, 600, 1700].map(t => windowHas(t, w))).toEqual([true, true, true, false, false]);
    expect(startsInWindow([100, 1500, 1700], w)).toEqual([100, 60]);
  });
  it('leaves daytime windows and windows past midnight as they were', () => {
    expect([700, 1500].map(t => windowHas(t, { start: 600, end: 1080 }))).toEqual([true, false]);
    expect([1380, 1500, 100].map(t => windowHas(t, { start: 1380, end: 1680 }))).toEqual([true, true, false]);
  });
});

describe('tool annotations (CIV-1854: every directory asks for a title and readOnlyHint)', () => {
  it('marks every tool read-only, with a title', async () => {
    const { TOOLS } = await import('../mcp/tools');
    for (const t of TOOLS) {
      expect(t.title, t.name).not.toBe(t.name);
      expect(t.annotations).toMatchObject({ title: t.title, readOnlyHint: true, destructiveHint: false, openWorldHint: false });
    }
  });
});

describe('hourly figures by branch (CIV-1840)', () => {
  const row = (directionId: number, headsign: string, variant: string, by: Record<string, number>, hours: Record<string, number | null>) => ({ directionId, headsign, routeVariant: variant, departuresByHour: by, headwayByHour: hours });
  const north = (variant: string) => row(1, 'Wilson', variant, { '8': 6, '9': 6 }, { '8': 10, '9': 10 });
  const rows = [
    row(0, 'Exhibition (Dufferin Gate)', 'a', { '8': 4, '9': 4 }, { '8': 15, '9': 15 }),
    row(0, "Exhibition (Princes' Gates)", 'b', { '8': 2, '9': 2 }, { '8': 30, '9': 30 }),
    north('from Dufferin Gate Loop'), north("from Princes' Gates Loop"),
  ];
  const r = { key: '29', name: '29', shortName: '29', longName: 'Dufferin', mode: 'Bus', rows } as unknown as Parameters<typeof hourlyFrequency>[0];
  const endOf = (x: { directionId?: unknown; headsign?: unknown }) => (x.directionId === 1 ? 'Wilson Station' : String(x.headsign));

  it('shows branches that end at the same stop and read the same as one column', () => {
    expect(hourlyFrequency(r, 480, 600, endOf as never).map(c => c.towards)).toEqual(['Exhibition (Dufferin Gate) a', "Exhibition (Princes' Gates) b", 'Wilson']);
  });
  it('keeps every column when the ends are not known', () => {
    expect(hourlyFrequency(r, 480, 600).length).toBe(4);
  });
});

describe('Live tools (CIV-1860)', () => {
  it('say plainly when an agency has no Live recordings, and which routes have figures', async () => {
    const { useLiveReader } = await import('../mcp/liveData');
    const { handlers } = await import('../mcp/tools');
    useLiveReader({ manifest: async slug => (slug === 'ttc' ? { agency: 'ttc', thisWeek: { from: '2026-11-10', to: '2026-11-16' }, lastWeek: null, routes: ['504', '510'] } : null), ranking: async () => null, route: async () => null, coverage: async () => null });
    const none = await handlers.route_reliability({ agency: 'OC Transpo', route: '1' }) as { live: null; note: string };
    expect(none.live).toBeNull();
    expect(none.note).toMatch(/does not record Live data/);
    const other = await handlers.route_bunching({ agency: 'TTC', route: '29' }) as { routesWithFigures: string[] };
    expect(other.routesWithFigures).toEqual(['504', '510']);
    await expect(handlers.route_reliability({ agency: 'TTC', route: '504', period: 'Noonish' })).rejects.toThrow(/Part of the day/);
  });
});

describe('Live files in the private bucket (CIV-1860)', () => {
  const week = (healthy: number) => ({ days: 7, dates: ['2026-11-10', '2026-11-16'], healthyDates: Array.from({ length: healthy }, (_, i) => `2026-11-1${i}`), late: null, tripTime: null, extraWait: null, bunching: null, delivered: null });

  it('reads the files the builder writes, only for agencies the index lists', async () => {
    const { splitLiveReader, liveSplitPaths, liveIndexPath, useLiveReader, publishedLiveReader } = await import('../mcp/liveData');
    const { handlers } = await import('../mcp/tools');
    const files = new Map<string, unknown>([
      [liveIndexPath, { generatedAt: 'x', agencies: { ttc: { figures: true, routes: 1 } } }],
      [liveSplitPaths.manifest('ttc'), { agency: 'ttc', thisWeek: { from: '2026-11-10', to: '2026-11-16' }, lastWeek: null, routes: ['504'] }],
      [liveSplitPaths.ranking('ttc'), { generatedAt: 'x', covered: ['504'], held: [], routes: [{ route: '504', titleLabel: '504 King', lateShare: 0.073, lateN: 3377, lateLastWeek: 0.08, bunchingShare: 0.39, bunchedShare: 0.3, gappedShare: 0.09, deliveredShare: 0.989 }] }],
      // Left from an older run but no longer listed in the index: never served.
      [liveSplitPaths.manifest('hamilton'), { agency: 'hamilton', thisWeek: null, lastWeek: null, routes: ['1'] }],
    ]);
    useLiveReader(splitLiveReader(async p => files.get(p) ?? null));
    const r = await handlers.route_reliability({ agency: 'TTC' }) as { routes: Array<{ route: string; lateShare: number }> };
    expect(r.routes).toEqual([expect.objectContaining({ route: '504', lateShare: 0.073 })]);
    const h = await handlers.route_reliability({ agency: 'Hamilton', route: '1' }) as { live: null };
    expect(h.live).toBeNull();
    useLiveReader(publishedLiveReader);
  });

  it('states the limits until a route has enough good days, then switches figures on', async () => {
    const { liveFiguresReady, liveCoverage, coverageLimits } = await import('../../shared/liveCoverage');
    const { LIVE_MIN_DAYS_TO_SHOW } = await import('../../shared/rules/live');
    const v3 = (n: number) => ({ schema: 3, weekly: { minHealthyDays: LIVE_MIN_DAYS_TO_SHOW, health: [], thisWeek: week(n), lastWeek: week(0), comparable: false } }) as never;
    expect(liveFiguresReady(v3(LIVE_MIN_DAYS_TO_SHOW - 1))).toBe(false);
    expect(liveFiguresReady(v3(LIVE_MIN_DAYS_TO_SHOW))).toBe(true);
    const c = liveCoverage('kingston', ['2026-11-15', '2026-11-16', '2026-11-17'], '2026-11-18');
    const before = coverageLimits(c, 0, '2026-11-18'); // pinned: the earliest-figures day depends on today
    expect(before.join(' ')).toMatch(/3 service days, 2026-11-15 to 2026-11-17/);
    expect(before.join(' ')).toMatch(new RegExp(`at least ${LIVE_MIN_DAYS_TO_SHOW} good days`));
    expect(before.join(' ')).toMatch(new RegExp(`earliest figures are on 2026-11-${15 + LIVE_MIN_DAYS_TO_SHOW + 1}`));
    expect(coverageLimits(c, 5).join(' ')).not.toMatch(/No figures yet/);

    const { useLiveReader, publishedLiveReader } = await import('../mcp/liveData');
    const { handlers } = await import('../mcp/tools');
    useLiveReader({ manifest: async () => null, ranking: async () => null, route: async () => null, coverage: async slug => (slug === 'kingston' ? c : null) });
    const k = await handlers.route_reliability({ agency: 'Kingston Transit', route: '501' }) as { live: null; note: string; limits: string[] };
    expect(k.live).toBeNull();
    expect(k.note).toMatch(/records Live data .* no figures for it yet/);
    expect(k.limits.join(' ')).toMatch(/No figures yet/);
    useLiveReader(publishedLiveReader);
  });

  it('the builder prints counts only: no agency, route or figure in its log lines', () => {
    const src = readFileSync(resolve(__dirname, '../mcp/releaseLivePrivate.ts'), 'utf8');
    const logs = src.match(/console\.(log|error|warn)\([^;]*\);/g) ?? [];
    expect(logs.length).toBeGreaterThan(0);
    for (const line of logs) expect(line).not.toMatch(/\$\{(slug|route|coverage|built|manifest|summary|title|e)\b/);
    expect(src).not.toMatch(/stdio:\s*'inherit'/);
  });
});

describe('route lookup (CIV-1864)', () => {
  it('uses the map search rule after exact names and lines: leading zeros, numbers, names, rail first', async () => {
    const { findRoute } = await import('../mcp/atlasData');
    const r = (shortName: string, longName: string | null, mode = 'Bus') => ({ shortName, name: shortName, longName, mode });
    const routes = [r('01', 'King'), r('10', 'B-Line Express'), r('60', 'Blue Island'), r('Blue', 'Blue Line', 'Subway'), r('105', 'Kingsway')];
    expect(findRoute(routes, '1')?.shortName).toBe('01');
    expect(findRoute(routes, 'blue')?.shortName).toBe('Blue');
    expect(findRoute(routes, 'b-line')?.shortName).toBe('10');
    expect(findRoute(routes, 'kingsway')?.shortName).toBe('105');
    expect(findRoute(routes, 'zzz')).toBeNull();
  });

  it('among exact names, takes a short-name match, then rail before bus (#1623, GO "Lakeshore West")', async () => {
    const { findRoute } = await import('../mcp/atlasData');
    const r = (shortName: string, longName: string | null, mode = 'Bus') => ({ shortName, name: shortName, longName, mode });
    const period = (shown: string) => ({ shown });
    const nightOnly = { amPeak: period('no service'), midday: period('no service'), pmPeak: period('no service'), evening: period('no service'), late: period('some trips'), overnight: period('every 30 min') };
    const allDay = { ...nightOnly, amPeak: period('every 5 min'), midday: period('every 5 min') };
    const routes = [r('18', 'Lakeshore West'), r('LW', 'Lakeshore West', 'Commuter rail'), r('LE', 'Lakeshore East', 'Commuter rail'), { ...r('304', 'King', 'Streetcar'), figures: nightOnly }, { ...r('504', 'King', 'Streetcar'), figures: allDay }];
    expect(findRoute(routes, 'Lakeshore West')?.shortName).toBe('LW');
    expect(findRoute(routes, '18')?.shortName).toBe('18');
    expect(findRoute(routes, 'King')?.shortName).toBe('504');
    // The answer names the other route of that name, unless the query was the picked route's own number.
    const { otherExactMatches } = await import('../mcp/atlasData');
    expect(otherExactMatches(routes, 'Lakeshore West', findRoute(routes, 'Lakeshore West')!).map(o => o.shortName)).toEqual(['18']);
    expect(otherExactMatches(routes, 'King', findRoute(routes, 'King')!).map(o => o.shortName)).toEqual(['304']);
    expect(otherExactMatches(routes, 'LW', findRoute(routes, 'LW')!)).toEqual([]);
  });

  it('takes a name holding the words typed over one that only contains the letters (Metro Transit "E Line")', async () => {
    const { findRoute } = await import('../mcp/atlasData');
    const r = (shortName: string, longName: string | null, mode = 'Bus') => ({ shortName, name: shortName, longName, mode });
    const routes = [r('901', 'METRO Blue Line', 'Light rail'), r('925', 'METRO E Line'), r('921', 'METRO A Line')];
    expect(findRoute(routes, 'E Line')?.shortName).toBe('925');
    expect(findRoute(routes, 'METRO E Line')?.shortName).toBe('925');
    expect(findRoute(routes, 'blue line')?.shortName).toBe('901');
    expect(findRoute(routes, 'a line')?.shortName).toBe('921');
  });
});


describe('schedule_changes on an old comparison (#1624)', () => {
  it('adds a note when the later schedule is more than 45 days before today', async () => {
    const { staleComparisonNote } = await import('../mcp/tools');
    const nov19 = Date.parse('2026-11-19T12:00:00Z');
    expect(staleComparisonNote('20260527', nov19).staleNote).toMatch(/check route_frequency/);
    expect(staleComparisonNote('20261125', nov19)).toEqual({});
    expect(staleComparisonNote('20261010', nov19)).toEqual({});
  });
});
