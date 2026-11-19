import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { remapKeysByPeriod, type HistoryPeriodRemaps } from '../historyRouteConfig.js';

// CIV-437: LA Metro rail keys are route_ids. 806 is Expo until 2022; 804 is Gold until 2022, then the E Line.
describe('History period-scoped key remaps (CIV-437)', () => {
  const remaps = JSON.parse(readFileSync('config/history-period-remaps.json', 'utf8')) as HistoryPeriodRemaps;
  const item = (periodKey: string, line: string) => ({ periodKey, line });
  const rail = {
    '801': [item('20161022', 'A'), item('20250930', 'A')],
    '804': [item('20161022', 'Gold'), item('20221005', 'Gold'), item('20230808', 'E'), item('20250930', 'E')],
    '806': [item('20161022', 'Expo'), item('20221005', 'Expo')],
    '807': [item('20230808', 'K')],
  };
  const out = remapKeysByPeriod(rail, remaps.lacmta, i => i.periodKey).routes;

  it('files the old Gold Line under its own ended key and joins Expo to the E Line', () => {
    expect(out['L Gold'].map(i => i.periodKey)).toEqual(['20161022', '20221005']);
    expect(out['L Gold'].every(i => i.line === 'Gold')).toBe(true);
    // Order is not part of the contract: the v2 build sorts by real date.
    expect(out['804'].map(i => `${i.periodKey}:${i.line}`).sort()).toEqual(['20161022:Expo', '20221005:Expo', '20230808:E', '20250930:E']);
    expect(out['806']).toBeUndefined();
  });

  it('does not chain (806 goes to 804, not on to L Gold) and leaves other keys alone', () => {
    expect(out['801']).toEqual(rail['801']);
    expect(out['807']).toEqual(rail['807']);
    expect(Object.keys(out).sort()).toEqual(['801', '804', '807', 'L Gold']);
  });

  it('changes nothing for another agency or with no rules', () => {
    expect(remapKeysByPeriod(rail, remaps.ttc, i => i.periodKey).routes).toBe(rail);
  });

  it('the cut-over date is exclusive: a period on or after it keeps its key', () => {
    const r = remapKeysByPeriod({ '804': [item('20221231', 'x'), item('20230101', 'y')] }, remaps.lacmta, i => i.periodKey).routes;
    expect(r['L Gold'].map(i => i.line)).toEqual(['x']);
    expect(r['804'].map(i => i.line)).toEqual(['y']);
  });
});
