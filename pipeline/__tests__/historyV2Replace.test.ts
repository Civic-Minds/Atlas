import { describe, expect, it } from 'vitest';
import { checkWeekendOnlyAddition, mergeWeekendFields, replacementBackupKey } from '../historyV2Replace.js';

// CIV-1430: the approved-replacement check (history:upload --replace-approved).
describe('checkWeekendOnlyAddition (CIV-1430)', () => {
  it('the replacement check works on bytes: a reordered key is refused', () => {
    expect(checkWeekendOnlyAddition('{"routes":{"1":{"rep":{"h":1}}},"refDate":"x"}', '{"refDate":"x","routes":{"1":{"rep":{"h":1}}}}').ok).toBe(false);
  });

  it('the backup key is under its own prefix, by ticket, and differs for different old bodies', () => {
    const a = replacementBackupKey('CIV-1430', 'history-v2/mbta/20181202.json', 'a');
    expect(a).toMatch(/^history-v2-replaced\/CIV-1430\/mbta\/20181202\.[0-9a-f]{16}\.json$/);
    expect(replacementBackupKey('CIV-1430', 'history-v2/mbta/20181202.json', 'b')).not.toBe(a);
  });
});

// CIV-1430 option 1: the published file plus only the rebuilt weekend p / t / tp.
describe('mergeWeekendFields (CIV-1430)', () => {
  const pub = JSON.stringify({ version: 2, slug: 'mbta', periodKey: 'p', refDate: '20181129', routes: {
    1: { name: 'One', rep: { h: 12, p: { midday: 12 } }, sat: { h: 15 }, sun: { none: true } },
    7: { rep: { lim: true }, sat: { lim: true }, sun: { h: 60 } },
    9: { rep: { h: 20 } },
  }, refDateQuality: { holiday: false, reason: 'r' } });
  const rebuilt = {
    1: { name: 'One', rep: { h: 11, p: { midday: 11 }, tp: { midday: 8 } }, sat: { h: 15, p: { midday: 15 }, t: 9, tp: { midday: 9 } }, sun: { none: true } },
    7: { rep: { lim: true }, sat: { lim: true, p: { midday: 60 } }, sun: { h: 45, p: { midday: 45 } } },
    9: { rep: { h: 20 }, sat: { h: 30, p: { midday: 30 } } },
    NEW: { rep: { h: 5 }, sat: { h: 5, p: { midday: 5 } } },
  };
  it('weekday fields, names, top-level fields and route set stay exactly as published; only weekend p / t / tp are added', () => {
    const m = mergeWeekendFields(pub, rebuilt);
    const out = JSON.parse(m.body);
    const before = JSON.parse(pub);
    expect(Object.keys(out.routes)).toEqual(['1', '7', '9']);
    for (const k of Object.keys(before.routes)) expect(out.routes[k].rep).toEqual(before.routes[k].rep);
    expect(out.refDateQuality).toEqual(before.refDateQuality);
    expect(out.routes['1'].sat).toEqual({ h: 15, p: { midday: 15 }, t: 9, tp: { midday: 9 } });
    expect(out.routes['7'].sat).toEqual({ lim: true, p: { midday: 60 } });
    expect(out.routes['9'].sat).toBeUndefined();
    expect(checkWeekendOnlyAddition(pub, m.body)).toMatchObject({ ok: true });
  });
  it('a day whose rebuilt headline differs is left alone and reported', () => {
    const m = mergeWeekendFields(pub, rebuilt);
    expect(JSON.parse(m.body).routes['7'].sun).toEqual({ h: 60 });
    expect(m.skipped).toContainEqual({ route: '7', day: 'sun', reason: 'headline differs (published h:60, rebuilt h:45)' });
  });
  it('a conflict on any other field still refuses', () => {
    const m = mergeWeekendFields(pub, rebuilt);
    expect(checkWeekendOnlyAddition(pub, m.body.replace('"h":12', '"h":13')).ok).toBe(false);
    expect(checkWeekendOnlyAddition(pub, m.body.replace('"refDate":"20181129"', '"refDate":"20181130"')).ok).toBe(false);
  });
  it('refuses a published file that is not in compact form (its bytes could not be kept)', () => {
    expect(() => mergeWeekendFields(JSON.stringify(JSON.parse(pub), null, 2), rebuilt)).toThrow(/compact form/);
  });
});
