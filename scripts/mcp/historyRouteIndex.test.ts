import { describe, expect, it } from 'vitest';
import { historyRouteIndex } from './atlasData';

// #1956: route_history picks a route the way route_frequency does, and never another number containing the one asked.
describe('historyRouteIndex', () => {
  const names: Array<[string, string | null]> = [['21', 'Lakeside - Timberlea'], ['10', 'Dalhousie'], ['01', 'Spring Garden'], ['9A', 'Herring Cove'], ['Blue', 'Blue Line']];
  it('finds the route number asked, leading zeros allowed', () => {
    expect(historyRouteIndex(names, '1')).toBe(2);
    expect(historyRouteIndex(names, '21')).toBe(0);
    expect(historyRouteIndex(names, '9a')).toBe(3);
  });
  it('finds a route by name', () => {
    expect(historyRouteIndex(names, 'Lakeside - Timberlea')).toBe(0);
    expect(historyRouteIndex(names, 'blue')).toBe(4);
  });
  it('says none rather than answering for another number', () => {
    const noOne: Array<[string, string | null]> = [['21', 'Lakeside - Timberlea'], ['10', 'Dalhousie']];
    expect(historyRouteIndex(noOne, '1')).toBe(-1);
    expect(historyRouteIndex(noOne, '99')).toBe(-1);
  });
});
