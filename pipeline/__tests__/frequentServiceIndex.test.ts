import { describe, expect, it } from 'vitest';
import { buildFrequentServiceIndex, extractFrequentServiceRoutes } from '../frequentServiceIndex';

const flags = { daytime15: true, daytime30: true, extended15: false, extended30: false };

describe('frequent service index', () => {
  it('extracts only features with at least one research qualification', () => {
    expect(extractFrequentServiceRoutes('ttc', 'TTC', 'Ontario', [
      { properties: { routeShortName: '1', day: 'Weekday', researchFrequentService: flags } },
      { properties: { routeShortName: '2', day: 'Weekday', researchFrequentService: { daytime15: false, daytime30: false, extended15: false, extended30: false } } },
    ])).toHaveLength(1);
  });

  it('sorts routes and counts unique agencies', () => {
    const index = buildFrequentServiceIndex([
      { agencySlug: 'ttc', agencyName: 'TTC', region: null, routeShortName: '10', routeLongName: null, routeColor: null, directionId: 0, headsign: null, day: 'Weekday', researchFrequentService: flags },
      { agencySlug: 'brampton', agencyName: 'Brampton', region: null, routeShortName: '1', routeLongName: null, routeColor: null, directionId: 0, headsign: null, day: 'Weekday', researchFrequentService: flags },
    ]);
    expect(index.agencyCount).toBe(2);
    expect(index.routes.map(route => route.agencySlug)).toEqual(['brampton', 'ttc']);
  });
});
