import { describe, expect, it } from 'vitest';
import { liveScheduledHeadway } from '../liveScheduledHeadway';
import { branchDisplayPeriodHeadway } from '../routeFacts';
import ttc96json from './fixtures/ttc-96-weekday.json';
import ttc29json from './fixtures/ttc-29-weekday.json';

const ttc96 = ttc96json as unknown as GeoJSON.FeatureCollection;
const ttc29 = ttc29json as unknown as GeoJSON.FeatureCollection;

// #1234: Live's "scheduled every N" is the route card's own number, not one pattern's.
describe('liveScheduledHeadway', () => {
  it('reads the card\'s Combined row where its branches are pooled (TTC 96 midday)', () => {
    // Each branch runs about every 17; together they run every 6 (one way) and every 9 (the other), as the card says.
    const own = ttc96.features
      .map(f => branchDisplayPeriodHeadway(f.properties as never, 'midday'))
      .filter((v): v is number => v != null);
    expect(Math.min(...own)).toBe(17);
    expect(liveScheduledHeadway(ttc96, 'ttc::96', 'Weekday', 'midday', 1)).toBe(6);
    expect(liveScheduledHeadway(ttc96, 'ttc::96', 'Weekday', 'midday', 0)).toBe(9);
  });

  it('with no direction picked, reads the more frequent direction', () => {
    expect(liveScheduledHeadway(ttc96, 'ttc::96', 'Weekday', 'midday', null)).toBe(6);
  });

  it('says nothing when the card shows no number (TTC 29 overnight)', () => {
    expect(liveScheduledHeadway(ttc29, 'ttc::29', 'Weekday', 'overnight', 1)).toBeNull();
  });

  it('says nothing for a route the layer does not have', () => {
    expect(liveScheduledHeadway(ttc29, 'ttc::999', 'Weekday', 'midday', null)).toBeNull();
  });
});
