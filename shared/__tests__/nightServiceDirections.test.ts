import { describe, expect, it } from 'vitest';
import { stampNightServiceEveryDirection } from '../nightServiceDirections';

type Props = Record<string, unknown>;
const f = (properties: Props) => ({ properties });
const flags = (feature: { properties: Props }) => [feature.properties.nightService30, feature.properties.nightService60, feature.properties.nightService];

describe('stampNightServiceEveryDirection', () => {
  it('keeps a route-day lit when both directions pass', () => {
    const features = [
      f({ routeShortName: '300', directionId: 0, day: 'Saturday', nightService30: true, nightService60: true, nightService: true }),
      f({ routeShortName: '300', directionId: 1, day: 'Saturday', nightService30: true, nightService60: true, nightService: true }),
    ];
    stampNightServiceEveryDirection(features);
    expect(features.map(flags)).toEqual([[true, true, true], [true, true, true]]);
  });

  it('clears the whole route-day when one direction fails (the slower direction decides)', () => {
    const features = [
      f({ routeShortName: '300', directionId: 0, day: 'Saturday', nightService30: true, nightService60: true, nightService: true }),
      f({ routeShortName: '300', directionId: 1, day: 'Saturday', nightService30: false, nightService60: false, nightService: false }),
    ];
    stampNightServiceEveryDirection(features);
    expect(features.map(flags)).toEqual([[false, false, false], [false, false, false]]);
  });

  it('judges the 30 and 60 minute rules separately', () => {
    const features = [
      f({ routeShortName: '7', directionId: 0, day: 'Saturday', nightService30: true, nightService60: true, nightService: true }),
      f({ routeShortName: '7', directionId: 1, day: 'Saturday', nightService30: false, nightService60: true, nightService: true }),
    ];
    stampNightServiceEveryDirection(features);
    expect(features.map(flags)).toEqual([[false, true, true], [false, true, true]]);
  });

  it('lets one passing pattern speak for its direction, and never lights a pattern that failed alone', () => {
    const main = f({ routeShortName: '5', directionId: 0, day: 'Sunday', nightService30: false, nightService60: true, nightService: true });
    const shortTurn = f({ routeShortName: '5', directionId: 0, day: 'Sunday', nightService30: false, nightService60: false, nightService: false });
    const back = f({ routeShortName: '5', directionId: 1, day: 'Sunday', nightService30: false, nightService60: true, nightService: true });
    stampNightServiceEveryDirection([main, shortTurn, back]);
    expect(flags(main)).toEqual([false, true, true]);
    expect(flags(shortTurn)).toEqual([false, false, false]);
    expect(flags(back)).toEqual([false, true, true]);
  });

  it('counts a single-direction route (loop or one-way) as one direction', () => {
    const loop = f({ routeShortName: 'L', directionId: 0, day: 'Saturday', nightService30: false, nightService60: true, nightService: true });
    stampNightServiceEveryDirection([loop]);
    expect(flags(loop)).toEqual([false, true, true]);
  });

  it('treats features with no direction id as one direction when the route has none, and ignores them otherwise', () => {
    const noDir = f({ routeShortName: 'M', day: 'Saturday', nightService30: true, nightService60: true, nightService: true });
    stampNightServiceEveryDirection([noDir]);
    expect(flags(noDir)).toEqual([true, true, true]);

    const withDirs = [
      f({ routeShortName: 'N', directionId: 0, day: 'Saturday', nightService30: true, nightService60: true, nightService: true }),
      f({ routeShortName: 'N', directionId: 1, day: 'Saturday', nightService30: true, nightService60: true, nightService: true }),
      f({ routeShortName: 'N', day: 'Saturday', nightService30: false, nightService60: false, nightService: false }),
    ];
    stampNightServiceEveryDirection(withDirs);
    expect(withDirs.slice(0, 2).map(flags)).toEqual([[true, true, true], [true, true, true]]);
  });

  it('keeps days and branches apart, and groups blank short names by route id', () => {
    const sat = f({ routeShortName: '1', directionId: 0, day: 'Saturday', nightService30: true, nightService60: true, nightService: true });
    const sun = f({ routeShortName: '1', directionId: 0, day: 'Sunday', nightService30: true, nightService60: true, nightService: true });
    const sunBack = f({ routeShortName: '1', directionId: 1, day: 'Sunday', nightService30: false, nightService60: false, nightService: false });
    const rail = f({ routeShortName: '', routeId: 'R1', directionId: 0, day: 'Saturday', nightService30: true, nightService60: true, nightService: true });
    const otherRail = f({ routeShortName: '', routeId: 'R2', directionId: 1, day: 'Saturday', nightService30: false, nightService60: false, nightService: false });
    stampNightServiceEveryDirection([sat, sun, sunBack, rail, otherRail]);
    expect(flags(sat)).toEqual([true, true, true]);
    expect(flags(sun)).toEqual([false, false, false]);
    expect(flags(rail)).toEqual([true, true, true]);
  });

  it('leaves features without night flags untouched', () => {
    const plain = f({ routeShortName: '9', directionId: 0, day: 'Saturday' });
    stampNightServiceEveryDirection([plain]);
    expect(plain.properties).toEqual({ routeShortName: '9', directionId: 0, day: 'Saturday' });
  });
});
