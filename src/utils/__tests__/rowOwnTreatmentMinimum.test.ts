import { describe, expect, it } from 'vitest';
import type { ShapeProperties } from '../../hooks/useIntervalStats';
import { rowOwnTreatment } from '../rowTrips';

// #1827: CIV-2232's 4-trip minimum (Ryan, 2026-11-24) holds on branch rows too. SEPTA 20 Sunday evening to Frankford Transit
// Center: 3 evenly spaced trips, a 171-minute wait, no "from"/"until" words, read "every 171 min".
const row = (trips: number, extra: Partial<ShapeProperties> = {}) => ({
  departuresByHour: Object.fromEntries([19, 20, 21, 22].slice(0, trips).map(h => [String(h), 1])),
  headwayByPeriod: { evening: 108 }, maxGapByPeriod: { evening: 171 }, periodCoverageHeadway: { evening: 171 },
  headwayByPeriodSustained: { evening: true }, ...extra,
}) as unknown as ShapeProperties;

describe('a branch row\'s own reading keeps the 4-trip minimum (#1827)', () => {
  it('gives 3 trips with a wait over an hour no number', () => {
    expect(rowOwnTreatment(row(3), 'evening')).toBeNull();
  });
  it('keeps the number of a row whose words say when it stops (Ryan\'s second pick)', () => {
    expect(rowOwnTreatment(row(3, { rowPeriodEdge: { evening: { until: 1290, every: 60 } } } as never), 'evening')).toMatchObject({ t: 'tail', every: 60 });
  });
  it('keeps the number with 4 trips', () => {
    expect(rowOwnTreatment(row(4), 'evening')).toMatchObject({ t: 'reading' });
  });
});
