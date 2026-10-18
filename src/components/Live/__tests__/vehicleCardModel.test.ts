import { describe, expect, it } from 'vitest';
import { delayLabel, vehicleCardName, vehicleCardRows } from '../vehicleCardModel';

const base = { headsign: 'Humber Loop', directionId: 0, speedKmh: 23, delayMin: 7.2, statusLabel: null, status: 'late' as const };

describe('vehicle card content', () => {
  it('maps direction, destination, speed and schedule', () => {
    expect(vehicleCardRows(base, 'Westbound')).toEqual([
      { label: 'Direction', value: 'Westbound' },
      { label: 'Destination', value: 'Humber Loop' },
      { label: 'Speed', value: '23 km/h' },
      { label: 'Schedule', value: '7 min late', status: 'late' },
    ]);
  });
  it('omits what the feed did not give and never repeats the destination as direction', () => {
    const rows = vehicleCardRows({ ...base, speedKmh: null, delayMin: null, status: 'no_data' }, 'Humber Loop');
    expect(rows).toEqual([{ label: 'Destination', value: 'Humber Loop' }]);
  });
  it('says on time and early in the list wording', () => {
    expect(delayLabel({ delayMin: 1, statusLabel: null })).toBe('On time');
    expect(delayLabel({ delayMin: -3, statusLabel: null })).toMatch(/early$/);
  });
  it('names a vehicle only when the feed gives a fleet label', () => {
    expect(vehicleCardName({ id: 'a1b2c3d4-0000-0000-0000-000000000000', vehicleLabel: null }, 'Bus')).toBeNull();
    expect(vehicleCardName({ id: 'x', vehicleLabel: '4412' }, 'Streetcar')).toBe('Streetcar 4412');
  });
});
