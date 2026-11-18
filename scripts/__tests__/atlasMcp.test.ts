import { describe, expect, it } from 'vitest';
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
