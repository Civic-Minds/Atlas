import { describe, expect, it } from 'vitest';
import { featuresForStage } from '../FrequentServiceStoryMap';

const feature = (serviceClass: string, midday: number | null, daytime30: boolean, daytime15: boolean) => ({
  type: 'Feature',
  geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] },
  properties: { serviceClass, headwayByPeriod: { midday }, researchFrequentService: { daytime30, daytime15 } },
} as any);

describe('Frequent Service story stages', () => {
  it('never adds a rush-hour-only route back at the daytime stage', () => {
    const rushOnlyWithMiddayData = feature('time-limited', 20, true, true);
    const allDay = feature('regular', 20, true, true);

    expect(featuresForStage([rushOnlyWithMiddayData, allDay], 1, 15)).toEqual([allDay]);
    expect(featuresForStage([rushOnlyWithMiddayData, allDay], 2, 15)).toEqual([allDay]);
  });

  it('keeps the frequency stage within the daytime stage', () => {
    const daytimeOnly = feature('regular', 20, false, false);
    const frequent = feature('regular', 10, true, true);

    expect(featuresForStage([daytimeOnly, frequent], 3, 15)).toEqual([frequent]);
  });
});
