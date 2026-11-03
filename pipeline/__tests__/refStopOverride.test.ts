import { describe, expect, it } from 'vitest';
import { directionStretches, type DirectionTrip } from '../tripSets';

// #1292: NYC J toward Broad St: the AM skip-stop pattern runs past Chauncey St (the middle stop); the agency config reads
// the main stretch at Broadway Junction instead (refStopOverrides).
const stops = ['a', 'b', 'jct', 'chauncey', 'c', 'd', 'e'];
const trips: DirectionTrip[] = Array.from({ length: 60 }, (_, i) => ({
  tripId: `t${i}`,
  visits: stops.map((stopId, j) => ({ stopId, minutes: 360 + i * 15 + j * 2 })),
}));
const coord = (id: string) => [40 + stops.indexOf(id) * 0.01, -74] as [number, number];

describe('main stretch reference stop override (#1292)', () => {
  it('reads the configured stop when it is on the main stretch', () => {
    expect(directionStretches('J::1::Weekday', trips, coord).main!.refStop).toBe('chauncey');
    expect(directionStretches('J::1::Weekday', trips, coord, trips, 'shared', 'jct').main!.refStop).toBe('jct');
  });
  it('legitimate: a configured stop off the main stretch is ignored', () => {
    expect(directionStretches('J::1::Weekday', trips, coord, trips, 'shared', 'elsewhere').main!.refStop).toBe('chauncey');
  });
});
