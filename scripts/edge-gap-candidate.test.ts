import { describe, expect, it } from 'vitest';
import { applyEdgeGapCandidateCriteria } from './edge-gap-candidate';
import type { RawRouteDepartures } from '../types/gtfs';

const raw = (departureTimes: number[], route = 'edge-test'): RawRouteDepartures => ({
  route,
  dir: '0',
  day: 'Monday',
  routeType: '3',
  modeName: 'Bus',
  departureTimes,
  gaps: departureTimes.slice(1).map((time, index) => time - departureTimes[index]),
  serviceSpan: { start: departureTimes[0], end: departureTimes.at(-1)! },
  tripCount: departureTimes.length,
  serviceIds: ['weekday'],
  warnings: [],
});

const sustainedTenMinuteTimes = (openingGap: number): number[] => [
  420,
  420 + openingGap,
  ...Array.from({ length: 17 }, (_, index) => 420 + openingGap + 10 + index * 10),
];

describe('applyEdgeGapCandidateCriteria', () => {
  it('allows one true opening edge up to tier plus ten minutes', () => {
    const result = applyEdgeGapCandidateCriteria([raw(sustainedTenMinuteTimes(20))]);
    expect(result.find(item => item.route === 'edge-test')).toMatchObject({ tier: '10' });
  });

  it('rejects an opening edge more than ten minutes over the tier', () => {
    const result = applyEdgeGapCandidateCriteria([raw(sustainedTenMinuteTimes(21))]);
    expect(result.find(item => item.route === 'edge-test')?.tier).not.toBe('10');
  });

  it('does not treat an analysis-window boundary as a true service edge', () => {
    const times = sustainedTenMinuteTimes(20);
    const result = applyEdgeGapCandidateCriteria([raw([400, ...times], 'window-boundary')]);
    expect(result.find(item => item.route === 'window-boundary')?.tier).not.toBe('10');
  });

  it('allows both genuine edges when the internal schedule remains sustained', () => {
    const times = sustainedTenMinuteTimes(20);
    times.push(times.at(-1)! + 20);
    const result = applyEdgeGapCandidateCriteria([raw(times, 'both-edges')]);
    expect(result.find(item => item.route === 'both-edges')).toMatchObject({ tier: '10' });
  });

  it('does not use an edge allowance when only three departures would remain', () => {
    const result = applyEdgeGapCandidateCriteria([raw([420, 440, 450, 460], 'sparse-edge')]);
    expect(result.find(item => item.route === 'sparse-edge')?.tier).toBe('span');
  });
});
