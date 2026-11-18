import { describe, expect, it } from 'vitest';
import { routeTextMatchRank } from '../routeMatch';

describe('route text match (CIV-1864)', () => {
  const r = { shortName: '038', longName: 'Geary', visibleId: null };
  it('ranks number, then name', () => {
    expect(routeTextMatchRank(r, '38')).toBe(0);
    expect(routeTextMatchRank(r, '03')).toBe(1);
    expect(routeTextMatchRank(r, 'gea')).toBe(6);
    expect(routeTextMatchRank(r, '038 ge')).toBe(6);
    expect(routeTextMatchRank(r, 'x')).toBe(8);
    expect(routeTextMatchRank(r, '  ')).toBe(99);
  });
  it('matches a route ID only when the caller says riders see it', () => {
    expect(routeTextMatchRank({ shortName: '240', longName: null, visibleId: null }, '34504')).toBe(8);
    expect(routeTextMatchRank({ shortName: '', longName: null, visibleId: '34504' }, '34504')).toBe(2);
  });
});
