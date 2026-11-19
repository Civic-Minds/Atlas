import { describe, expect, it } from 'vitest';
import { cornerSeeds } from '../mcp/atlasData';

// About 111 m per 0.001° of latitude.
const stop = (name: string, dLat: number) => ({ name, lat: 43.78 + dLat, lon: -79.415 });

describe('routes_near corners whose stops are not named for both streets (#1614)', () => {
  const stops = [
    stop('FINCH GO BUS TERMINAL PLATFORM 2', 0), stop('FINCH GO BUS TERMINAL PLATFORM 3', 0.0003),
    stop('YONGE ST STOP # 4915', 0.003), stop('YONGE ST / DREWRY AV', 0.0055),
    stop('MARTIN GROVE RD / GOLDFINCH PL', 0.0001),
  ];
  it('takes the closest stops on each street, within a short walk', () => {
    const c = cornerSeeds(stops, ['yonge', 'finch'])!;
    expect(c.stops.map(s => s.name).sort()).toEqual(['FINCH GO BUS TERMINAL PLATFORM 2', 'FINCH GO BUS TERMINAL PLATFORM 3', 'YONGE ST STOP # 4915']);
    expect(c.apart).toBeGreaterThan(250);
    expect(c.apart).toBeLessThan(400);
  });
  it('matches whole words only, and gives up beyond the limit or with one street', () => {
    expect(cornerSeeds([stop('GOLDFINCH PL', 0), stop('YONGE ST', 0.001)], ['yonge', 'finch'])).toBeNull();
    expect(cornerSeeds([stop('FINCH AV', 0), stop('YONGE ST', 0.01)], ['yonge', 'finch'])).toBeNull();
    expect(cornerSeeds(stops, ['finch'])).toBeNull();
  });
});
