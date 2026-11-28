import { describe, expect, it } from 'vitest';
import { shownDisagrees } from './tools';

// #1952: routes_at_frequency's routes whose own list words don't reach the asked figure say so.
describe('shownDisagrees', () => {
  it('warns when the list says Irregular or nothing as often as asked', () => {
    expect(shownDisagrees('Irregular', 10).warning).toMatch(/"Irregular"/);
    expect(shownDisagrees('every 18 min from 3:42 PM', 15).warning).toMatch(/every 15 min or better/);
  });
  it('stays quiet when the list agrees', () => {
    expect(shownDisagrees('every 10 min', 10)).toEqual({});
    expect(shownDisagrees('every 5–16 min', 15)).toEqual({});
    expect(shownDisagrees('no service', 15)).toEqual({});
  });
});
