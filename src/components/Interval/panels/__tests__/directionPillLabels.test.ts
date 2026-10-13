import { describe, expect, it } from 'vitest';
import type { ShapeProperties } from '../../../../hooks/useIntervalStats';
import { directionPillLabels } from '../RouteCardHeadway';

const dir = (headsign: string | null) => ({ headsign } as unknown as ShapeProperties);
const group = (headsigns: (string | null)[], boundLabel?: string, span: (string | null)[] = []) => ({
  boundLabel,
  realTier: headsigns.map(dir),
  span: span.map(dir),
});

describe('directionPillLabels', () => {
  it('uses bound labels when present', () => {
    expect(directionPillLabels([group(['Islington'], 'Westbound'), group(['City Centre'], 'Eastbound')], '26', 'Burnhamthorpe'))
      .toEqual(['Westbound', 'Eastbound']);
  });

  it('uses the destination when there is no bound label, never "Direction N"', () => {
    const labels = directionPillLabels([group(['Downtown']), group(['Airport'])], '5', 'Main St');
    expect(labels).toEqual(['To Downtown', 'To Airport']);
    labels.forEach(label => expect(label).not.toMatch(/^Direction \d/));
  });

  it('names two destinations in one direction', () => {
    expect(directionPillLabels([group(['Downtown', 'Union Station'])], '5', 'Main St')[0])
      .toBe('To Downtown / Union Station');
  });

  it('falls back to limited-service headsigns before anything generic', () => {
    expect(directionPillLabels([group([], undefined, ['Depot'])], '5', 'Main St')).toEqual(['To Depot']);
  });

  it('only goes generic when a direction has no bound label or destination', () => {
    expect(directionPillLabels([group([null]), group([''])], '5', 'Main St')).toEqual(['One way', 'Other way']);
    expect(directionPillLabels([group([null]), group([null]), group([null])], '5', 'Main St'))
      .toEqual(['Pattern 1', 'Pattern 2', 'Pattern 3']);
  });

  it('keeps pills distinct when two directions share a destination', () => {
    expect(directionPillLabels([group(['Downtown']), group(['Downtown'])], '5', 'Main St'))
      .toEqual(['To Downtown', 'To Downtown (2)']);
  });
});
