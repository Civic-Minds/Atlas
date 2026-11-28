import { describe, expect, it } from 'vitest';
import { tripLastStopId } from '../process-core';

// #1877: the trips file carries each trip's last stop, so Live puts a vehicle under the destination its trip ends at.
describe('tripLastStopId', () => {
  it('takes the stop with the highest stop_sequence, whatever the file order', () => {
    expect(tripLastStopId([
      { stop_id: 'B', stop_sequence: '2' }, { stop_id: 'END', stop_sequence: '10' }, { stop_id: 'A', stop_sequence: '1' }, { stop_id: 'C', stop_sequence: '9' },
    ])).toBe('END');
  });
  it('gives nothing for a trip with no stop times', () => {
    expect(tripLastStopId(undefined)).toBeUndefined();
    expect(tripLastStopId([])).toBeUndefined();
  });
});
