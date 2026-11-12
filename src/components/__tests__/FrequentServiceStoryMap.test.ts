import { describe, expect, it } from 'vitest';
import { featuresForStage, stageCollection, STORY_LAYERS, storyFade, storyLayerOpacity, storyRows } from '../FrequentServiceStoryMap';

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

  it('counts weekday rows only, so a weekend row cannot carry a route into a stage (#1433)', () => {
    const onDay = (day: string | undefined, daytime15: boolean) => {
      const row = feature('regular', 10, true, daytime15);
      row.properties.day = day;
      return row;
    };
    const weekday = onDay('Weekday', false);
    const saturday = onDay('Saturday', true);
    const sunday = onDay('Sunday', true);
    const stop = { type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] }, properties: { day: 'Weekday' } } as any;

    const rows = storyRows([weekday, saturday, sunday, onDay(undefined, true), stop]);
    expect(rows).toEqual([weekday]);
    // Frequent on the weekend only: the route stays through the daytime stage and is gone at the frequency stage.
    expect(featuresForStage(rows, 2, 15)).toEqual([weekday]);
    expect(featuresForStage(rows, 3, 15)).toEqual([]);
  });

  // CIV-1408: what the map ends up drawing at each stage, from the layers' filters and end opacities.
  describe('what is drawn at each stage', () => {
    /** The `keep` values (0-3) drawn at a stage: on at least one layer that is lit and whose filter lets them through. */
    const drawnKeeps = (stage: number) => {
      const opacity = storyLayerOpacity(stage);
      return [0, 1, 2, 3].filter(keep => STORY_LAYERS.some(layer => opacity[layer.id] > 0 && keep >= layer.minKeep));
    };

    it('draws only the routes that still qualify, and nothing else', () => {
      expect(drawnKeeps(0)).toEqual([0, 1, 2, 3]);
      expect(drawnKeeps(1)).toEqual([1, 2, 3]);
      expect(drawnKeeps(2)).toEqual([2, 3]);
      expect(drawnKeeps(3)).toEqual([3]);
    });

    it('draws at each stage exactly the routes the stage rules keep', () => {
      const routes = [feature('time-limited', 20, true, true), feature('regular', null, false, false), feature('regular', 30, true, false), feature('regular', 10, true, true)];
      const keeps = stageCollection(routes, 15).features.map(f => f.properties?.keep as number);
      for (const stage of [0, 1, 2, 3]) {
        const drawn = routes.filter((_, i) => drawnKeeps(stage).includes(keeps[i]));
        expect(drawn).toEqual(featuresForStage(routes, stage, 15));
      }
    });

    it('lights the grey base of every route only at the first stage: no grey ghost of removed routes after it', () => {
      expect(storyLayerOpacity(0).routes).toBe(0.34);
      for (const stage of [1, 2, 3]) expect(storyLayerOpacity(stage).routes).toBe(0);
    });

    it('lights one orange layer per stage, at the same strength, and gives every layer an end state', () => {
      for (const stage of [0, 1, 2, 3]) {
        const opacity = storyLayerOpacity(stage);
        expect(Object.keys(opacity).sort()).toEqual(STORY_LAYERS.map(layer => layer.id).sort());
        const lit = STORY_LAYERS.filter(layer => layer.id !== 'routes' && opacity[layer.id] > 0);
        expect(lit.map(layer => layer.id)).toEqual([`stage-${stage}`]);
        expect(opacity[`stage-${stage}`]).toBe(0.88);
      }
    });

    it('scrolling back up gives the same picture as scrolling down did', () => {
      // The end state depends on the stage alone, never on the stage before it.
      const walk = [0, 1, 2, 3, 2, 1, 0].map(drawnKeeps);
      expect(walk).toEqual([[0, 1, 2, 3], [1, 2, 3], [2, 3], [3], [2, 3], [1, 2, 3], [0, 1, 2, 3]]);
    });

    it('fades between stages, and not at all for reduced motion', () => {
      expect(storyFade(false)).toEqual({ duration: 700, delay: 0 });
      expect(storyFade(true)).toEqual({ duration: 0, delay: 0 });
    });
  });
});
