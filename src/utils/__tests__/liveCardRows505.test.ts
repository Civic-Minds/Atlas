import { describe, expect, it } from 'vitest';
import fc from './fixtures/ttc-505-routes.json';
import { liveCardModelAt, liveCardRowKeys } from '../liveScheduledHeadway';
import { groupVehiclesByDirection, mergeIntoCardRows, routeDirectionLabels } from '../liveGrouping';
import { streetJoin } from '../stopLabel';
import type { LiveVehicle } from '../../context/LiveVehiclesMapOverlay';

// The TTC 505 shapes as published (2026-11-27); car 4511 is from the feed (2026-11-27 21:20), the Broadview cars take its
// fields with that direction's headsigns ("Broadview Ave" was a short trip's headsign on the critic's screenshot). The main
// map's card ended with "Broadview Ave · 1 vehicle" under "to Broadview" four times. The whole day's shapes name
// "Broadview Ave" (short trips, both directions) but the card draws only "to Dundas West" and "to Broadview".
const routes = fc as unknown as GeoJSON.FeatureCollection;
const car = (id: string, tripId: string, headsign: string, directionId: number) => ({ id, tripId, headsign, directionId, routeShortName: '505', agencySlug: 'ttc' }) as unknown as LiveVehicle;
const vehicles = [car('4511', '27637020', 'Dundas West', 1), car('4520', '27637100', 'Broadview', 0), car('4530', '27637200', 'Broadview Ave', 0)];

describe('TTC 505: every vehicle under a row the card draws', () => {
  for (const period of ['amPeak', 'midday', 'pmPeak', 'evening'] as const) {
    it(`Weekday ${period}`, () => {
      const rows = liveCardRowKeys(liveCardModelAt(routes, [], 'ttc', '505', 'Weekday', period), '505');
      const drawn = new Set(rows.map(r => r.key));
      expect(drawn.has('Broadview Ave')).toBe(false);
      const labels = new Map([...routeDirectionLabels(routes.features, '505')].map(([d, l]) => [d, streetJoin(l)]));
      const merged = mergeIntoCardRows(groupVehiclesByDirection(vehicles, labels), rows);
      expect([...merged.keys()].every(k => drawn.has(k))).toBe(true);
      expect(merged.get('Broadview')?.map(v => v.id)).toEqual(['4520', '4530']);
    });
  }
});
