import { describe, expect, it } from 'vitest';
import { displayNameFor, primaryCity, summarize } from './build-agency-page-summaries';

function line(name: string, directionId: number, midday: number | null, extra: Record<string, unknown> = {}) {
  return {
    geometry: { type: 'LineString' },
    properties: {
      routeId: name, routeShortName: name, routeLongName: `${name} Street`, routeType: 3, directionId, day: 'Weekday', tier: 'frequent',
      headway: midday,
      headwayByPeriod: { midday, amPeak: midday, pmPeak: midday },
      headwayByPeriodSustained: { midday: midday != null, amPeak: midday != null, pmPeak: midday != null },
      periodCoverageHeadway: { midday, amPeak: midday, pmPeak: midday },
      headwayByHour: { '6': midday, '7': midday, '25': midday },
      ...extra,
    },
  };
}

describe('summarize', () => {
  it('records a route by the route card rule, judged by its slower direction (#821)', () => {
    const s = summarize([line('A', 0, 10), line('A', 1, 10), line('B', 0, 8), line('B', 1, 25), line('C', 0, 60), line('C', 1, 60)], 'x', '2026-10-01');
    expect(s.routeCount).toBe(3);
    expect(s.routes.map(r => [r.name, r.midday, r.am, r.pm])).toEqual([['A', 10, 10, 10], ['B', 25, 25, 25], ['C', 60, 60, 60]]);
    expect(s.routes[0].mode).toBe(3);
    expect(s.span).toEqual({ first: 6, last: 25 });
  });

  it('ignores other days and stops, and keeps routes with no midday service', () => {
    const s = summarize([line('A', 0, 10), line('A', 1, 10), line('N', 0, null), line('S', 0, 5, { day: 'Saturday' }), { geometry: { type: 'Point' }, properties: { day: 'Weekday' } }], 'x', null);
    expect(s.routeCount).toBe(2);
    expect(s.routes.find(r => r.name === 'N')?.midday).toBeNull();
    expect(s.lastRefreshedAt).toBeNull();
  });
});

describe('night routes and weekend service', () => {
  const night = (name: string, day = 'Weekday') => ({
    geometry: { type: 'LineString' },
    properties: {
      routeId: name, routeShortName: name, routeLongName: `${name} Blue Night`, routeType: 3, directionId: 0, day, tier: 'infrequent',
      headway: null,
      headwayByPeriod: { amPeak: null, midday: null, pmPeak: null, evening: null, late: null, overnight: 30 },
      headwayByPeriodSustained: { overnight: true },
      periodCoverageHeadway: { overnight: 30 },
      headwayByHour: { '25': 30, '26': 30 },
    },
  });

  it('records overnight and evening cadence from the route card rule', () => {
    const s = summarize([night('301'), line('A', 0, 10), line('A', 1, 10)], 'x', null);
    expect(s.routes.find(r => r.name === '301')).toMatchObject({ midday: null, am: null, pm: null, evening: null, overnight: 30 });
  });

  it('shows the map\'s number for unsustained daytime periods (CIV-237), and also records the overnight cadence', () => {
    const l = line('46', 0, 19, { headwayByPeriodSustained: { midday: false, amPeak: false, pmPeak: false }, headwayByPeriod: { midday: 19, amPeak: 13, pmPeak: 13, overnight: 17 } });
    const r = summarize([l], 'x', null).routes[0];
    expect([r.midday, r.am, r.pm, r.overnight]).toEqual([19, 19, 19, 17]);
  });

  it('leaves every period empty for a route with no service at all', () => {
    const s = summarize([line('N', 0, null)], 'x', null);
    expect([s.routes[0].evening, s.routes[0].overnight]).toEqual([null, null]);
  });

  it('records whether the release has Saturday and Sunday service', () => {
    const s = summarize([line('A', 0, 10), line('A', 1, 10), line('A', 0, 12, { day: 'Saturday' })], 'x', null);
    expect([s.sat, s.sun]).toEqual([true, false]);
    expect([summarize([line('A', 0, 10)], 'x', null).sat, summarize([line('A', 0, 10)], 'x', null).sun]).toEqual([false, false]);
  });
});

describe('names', () => {
  const base = { slug: 'x', name: 'Toronto Transit Commission', cities: ['Etobicoke, Ontario'], region: 'Ontario' };

  it('uses the config displayArea as the primary city, else the first listed city', () => {
    expect(primaryCity({ ...base, displayArea: 'Toronto' })).toBe('Toronto');
    expect(primaryCity(base)).toBe('Etobicoke');
  });

  it('uses labelPlace, and an empty one drops the bracket', () => {
    const york = { slug: 'yrt', name: 'York Region Transit', cities: ['Vaughan, Ontario'], region: 'Ontario' };
    expect(displayNameFor({ ...york, shortName: 'YRT', labelPlace: 'York Region' })).toBe('YRT (York Region)');
    expect(displayNameFor({ ...york, labelPlace: '' })).toBe('York Region Transit');
  });

  it('drops the first-city bracket when the name already names a region, county or district', () => {
    expect(displayNameFor({ slug: 'd', name: 'Durham Region Transit', cities: ['Oshawa, Ontario'], region: 'Ontario' })).toBe('Durham Region Transit');
    expect(displayNameFor({ slug: 'b', name: 'Broward County Transit', cities: ['Pompano Beach, Florida'], region: 'Florida' })).toBe('Broward County Transit');
    expect(displayNameFor({ slug: 'm', name: 'Marin Transit', cities: ['San Rafael, California'], region: 'California' })).toBe('Marin Transit (San Rafael)');
    // a curated displayArea is kept even on a regional name
    expect(displayNameFor({ slug: 'g', name: 'GO Transit', displayArea: 'Greater Toronto & Hamilton Area', cities: ['Mississauga, Ontario'], region: 'Ontario' })).toBe('GO Transit (Greater Toronto & Hamilton Area)');
  });

  it('puts the short name first with the city in brackets, falling back to the full name', () => {
    expect(displayNameFor({ ...base, displayArea: 'Toronto', shortName: 'TTC' })).toBe('TTC (Toronto)');
    expect(displayNameFor({ ...base, displayArea: 'Toronto' })).toBe('Toronto Transit Commission');
    expect(displayNameFor({ slug: 'h', name: 'Halifax Transit', displayArea: 'Halifax' })).toBe('Halifax Transit');
  });
});
