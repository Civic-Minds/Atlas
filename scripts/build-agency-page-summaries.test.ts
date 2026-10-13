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
  it('records a route at its slower direction, like the map filter', () => {
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

describe('names', () => {
  const base = { slug: 'x', name: 'Toronto Transit Commission', cities: ['Etobicoke, Ontario'], region: 'Ontario' };

  it('uses the config displayArea as the primary city, else the first listed city', () => {
    expect(primaryCity({ ...base, displayArea: 'Toronto' })).toBe('Toronto');
    expect(primaryCity(base)).toBe('Etobicoke');
  });

  it('puts the short name first with the city in brackets, falling back to the full name', () => {
    expect(displayNameFor({ ...base, displayArea: 'Toronto', shortName: 'TTC' })).toBe('TTC (Toronto)');
    expect(displayNameFor({ ...base, displayArea: 'Toronto' })).toBe('Toronto Transit Commission');
    expect(displayNameFor({ slug: 'h', name: 'Halifax Transit', displayArea: 'Halifax' })).toBe('Halifax Transit');
  });
});
