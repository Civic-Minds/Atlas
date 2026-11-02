import { describe, expect, it } from 'vitest';
import { featuresForStage, stageCollection } from '../FrequentServiceStoryMap';

const feature = (serviceClass: string, midday: number | null, daytime30: boolean, daytime15: boolean, rowMidday: number | null = midday) => ({
  type: 'Feature',
  geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] },
  properties: {
    serviceClass,
    headwayByPeriod: { midday: rowMidday },
    routeFilterHeadwayByPeriod: { midday },
    routeRunsByPeriod: { midday: midday != null },
    researchFrequentService: { daytime30, daytime15 },
  },
} as any);

describe('Frequent Service story stages', () => {
  it('never adds a rush-hour-only route back at the daytime stage', () => {
    const rushOnlyWithMiddayData = feature('time-limited', 20, true, true);
    const allDay = feature('regular', 20, true, true);

    expect(featuresForStage([rushOnlyWithMiddayData, allDay], 1, 15)).toEqual([allDay]);
    expect(featuresForStage([rushOnlyWithMiddayData, allDay], 2, 15)).toEqual([allDay]);
  });

  it('reads midday from the route filter value, not the row (#750: SF Muni 8AX inbound)', () => {
    // The row's own terminal reading says every 8 at midday; the route has no regular midday service.
    const rowOnly = feature('regular', null, false, false, 8);
    const realMidday = feature('regular', 30, false, false);
    expect(featuresForStage([rowOnly, realMidday], 2, 30)).toEqual([realMidday]);
  });

  it('keeps the frequency stage within the daytime stage', () => {
    const daytimeOnly = feature('regular', 20, false, false);
    const frequent = feature('regular', 10, true, true);

    expect(featuresForStage([daytimeOnly, frequent], 3, 15)).toEqual([frequent]);
  });

  it('marks each route with the last stage it is shown at, so each stage layer filters on it (CIV-1168)', () => {
    const rushOnly = feature('time-limited', 20, true, true);
    const nightOnly = feature('regular', null, false, false);
    const every30 = feature('regular', 30, true, false);
    const every15 = feature('regular', 10, true, true);
    const keep = stageCollection([rushOnly, nightOnly, every30, every15], 15).features.map(f => f.properties?.keep);
    expect(keep).toEqual([0, 1, 2, 3]);
  });
});
