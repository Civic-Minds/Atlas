import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { identitySplitApplies, isPeriodExcluded } from '../historyRouteConfig.js';
import { splitRouteHistory } from '../historyRouteIdentity.js';

// CIV-1481: Brampton's 2013 feed listed MiWay 103 and VIVA Orange 605; its 56 was Springbrook, then Kingknoll from 2024.
describe('History route config (CIV-1481)', () => {
  const excludes = JSON.parse(readFileSync('config/history-period-excludes.json', 'utf8'));
  const identity = JSON.parse(readFileSync('config/history-route-identity.json', 'utf8'));

  it('leaves another agency\'s route out of the one period only', () => {
    expect(isPeriodExcluded(excludes, 'brampton', '20131018', '103')).toBe(true);
    expect(isPeriodExcluded(excludes, 'brampton', '20131018', '605')).toBe(true);
    expect(isPeriodExcluded(excludes, 'brampton', '20140811', '103')).toBe(false);
    expect(isPeriodExcluded(excludes, 'brampton', '20131018', '56')).toBe(false);
    expect(isPeriodExcluded(excludes, 'ttc', '20131018', '103')).toBe(false);
  });

  it('runs the reused-number split on listed keys while the global flag is off, and on every key when it is on', () => {
    expect(identitySplitApplies(false, identity, 'brampton', '56')).toBe(true);
    expect(identitySplitApplies(false, identity, 'brampton', '1')).toBe(false);
    expect(identitySplitApplies(false, identity, 'mbta', '85')).toBe(false);
    expect(identitySplitApplies(true, identity, 'mbta', '85')).toBe(true);
  });

  it('the split itself still decides: a renamed route on other streets splits, a renamed route on the same streets does not', () => {
    const a = [[-79.80, 43.70], [-79.79, 43.71]];
    const b = [[-79.70, 43.75], [-79.69, 43.76]];
    const p = (periodKey: string, year: number, name: string, line: number[][]) => ({ periodKey, sortKey: `${year}0601`, year, name, line });
    expect(splitRouteHistory([p('a', 2013, 'Springbrook', a), p('b', 2024, 'Kingknoll', b)], '56').segments).toHaveLength(2);
    expect(splitRouteHistory([p('a', 2013, 'Springbrook', a), p('b', 2024, 'Kingknoll', a)], '56').segments).toHaveLength(1);
  });
});
