import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { remapKeysByPeriod, seedSidecarOnlyKeys, type HistoryPeriodRemaps } from '../historyRouteConfig.js';

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

// CIV-437 follow-up: build-history lists only keys in its archive map; a key the remap creates only in the sidecars
// (L Gold) must be added there, the way build-history's remap block does it.
describe('build-history keeps a key the remap creates only in the sidecars (CIV-437)', () => {
  const remaps = JSON.parse(readFileSync('config/history-period-remaps.json', 'utf8')) as HistoryPeriodRemaps;
  type E = { periodKey: string };
  const e = (periodKey: string): E => ({ periodKey });
  /** build-history's order: seed sidecar-only keys, remap both maps, then seed the remap's new sidecar keys. */
  function build(slug: string, archiveIn: Record<string, E[]>, sidecarIn: Record<string, E[]>) {
    const archive: Record<string, E[]> = { ...archiveIn };
    for (const k of Object.keys(sidecarIn)) archive[k] ??= [];
    const rules = remaps[slug];
    if (!rules) return archive;
    const a = remapKeysByPeriod(archive, rules, x => x.periodKey).routes;
    seedSidecarOnlyKeys(a, remapKeysByPeriod(sidecarIn, rules, x => x.periodKey).routes);
    return a;
  }
  const years = (from: number, to: number, mmdd: string) => Array.from({ length: to - from + 1 }, (_, i) => e(`${from + i}${mmdd}`));

  it('LA Metro: L Gold (2016-2022) is listed, beside 804 and the other rail lines', () => {
    const sidecar = { '801': years(2016, 2025, '0907'), '804': years(2016, 2025, '0907'), '806': years(2016, 2022, '0907'), '807': years(2023, 2025, '0907') };
    const out = build('lacmta', { '2': [e('20190615')] }, sidecar);
    // 806 stays listed with no entries in either map (all its periods moved to 804), so the build skips it.
    expect(Object.keys(out).sort()).toEqual(['2', '801', '804', '806', '807', 'L Gold']);
    expect(out['806']).toEqual([]);
    expect(out['L Gold']).toEqual([]); // the entries are the sidecar's; the archive map only lists the key
    expect(out['2']).toEqual([e('20190615')]);
  });

  it('only LA Metro has remap rules, so no other agency can gain a key', () => {
    expect(Object.keys(remaps)).toEqual(['lacmta']);
    const sidecar = { '10': [e('20200101')], '11': [e('20210101')] };
    expect(Object.keys(build('ttc', { '10': [e('20190101')] }, sidecar)).sort()).toEqual(['10', '11']);
  });

  it('adds nothing when every sidecar key is already listed', () => {
    const archive: Record<string, E[]> = { a: [], b: [e('20200101')] };
    expect(seedSidecarOnlyKeys(archive, { a: [e('20200101')], b: [] })).toEqual([]);
    expect(archive).toEqual({ a: [], b: [e('20200101')] });
  });
});
