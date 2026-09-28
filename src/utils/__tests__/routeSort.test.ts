import { describe, expect, it } from 'vitest';
import { buildRouteSortKeyExpression } from '../routeSort';

describe('buildRouteSortKeyExpression', () => {
  it('assigns higher draw priority to more frequent service', () => {
    expect(buildRouteSortKeyExpression(['get', 'headway'])).toEqual([
      'case',
      ['<=', ['get', 'headway'], 10], 4,
      ['<=', ['get', 'headway'], 15], 3,
      ['<=', ['get', 'headway'], 30], 2,
      ['<=', ['get', 'headway'], 60], 1,
      0,
    ]);
  });
});
