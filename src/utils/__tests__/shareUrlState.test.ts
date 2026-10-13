import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AGENCY_URL_MAX_SLUGS,
  encodeAgencySelection,
  encodeCompareSideParams,
  encodeModesParam,
  isAgencyOff,
  parseAgencyUrlRule,
  parseCompareSideParams,
  parseHeadwayValue,
  parseModesParam,
  settleAgencyUrlRule,
  shouldPersistAgencySelection,
} from '../shareUrlState';
import { mergeUrlSearchParams } from '../syncUrlParams';

const catalog = (n: number) => Array.from({ length: n }, (_, i) => `agency-${String(i).padStart(3, '0')}`);

/** Encode → write into a URL → parse → resolve against the catalog, like a shared link opening. */
function roundTrip(selected: Set<string>, slugs: string[], savedOff = new Set<string>()): Set<string> {
  const qs = mergeUrlSearchParams('day=Saturday', encodeAgencySelection(selected, slugs));
  const rule = settleAgencyUrlRule(parseAgencyUrlRule(qs), slugs);
  return new Set(slugs.filter(s => !isAgencyOff(s, rule, savedOff)));
}

describe('encodeAgencySelection', () => {
  const slugs = catalog(500);

  it('leaves the default (everything on) out of the URL', () => {
    expect(encodeAgencySelection(new Set(slugs), slugs)).toEqual({ agencies: null, hide: null });
  });

  it('uses an include list when only a few are on', () => {
    const enc = encodeAgencySelection(new Set(['agency-010', 'agency-002']), slugs);
    expect(enc).toEqual({ agencies: 'agency-002.agency-010', hide: null });
  });

  it('uses an exclude list when most are on', () => {
    const selected = new Set(slugs.filter(s => s !== 'agency-007' && s !== 'agency-100'));
    expect(encodeAgencySelection(selected, slugs)).toEqual({ agencies: null, hide: 'agency-007.agency-100' });
  });

  it('picks the shorter form', () => {
    const small = catalog(10);
    // 4 on, 6 off -> include is shorter
    expect(encodeAgencySelection(new Set(small.slice(0, 4)), small).agencies).not.toBeNull();
    // 6 on, 4 off -> exclude is shorter
    expect(encodeAgencySelection(new Set(small.slice(0, 6)), small).hide).not.toBeNull();
  });

  it(`omits the selection when even the shorter form is over ${AGENCY_URL_MAX_SLUGS} slugs`, () => {
    expect(encodeAgencySelection(new Set(slugs.slice(0, 250)), slugs)).toEqual({ agencies: null, hide: null });
    expect(encodeAgencySelection(new Set(slugs.slice(0, AGENCY_URL_MAX_SLUGS)), slugs).agencies).not.toBeNull();
  });

  it('omits an empty selection and an unloaded catalog', () => {
    expect(encodeAgencySelection(new Set(), slugs)).toEqual({ agencies: null, hide: null });
    expect(encodeAgencySelection(new Set(['a']), [])).toEqual({ agencies: null, hide: null });
  });

  it('keeps the separator unencoded in the query string', () => {
    const qs = mergeUrlSearchParams('', encodeAgencySelection(new Set(['agency-001', 'agency-002']), slugs));
    expect(qs).toBe('agencies=agency-001.agency-002');
  });
});

describe('agency URL round trip', () => {
  const slugs = catalog(500);

  it('restores an include selection', () => {
    const selected = new Set(['agency-003', 'agency-450']);
    expect(roundTrip(selected, slugs)).toEqual(selected);
  });

  it('restores an exclude selection', () => {
    const selected = new Set(slugs.filter(s => s !== 'agency-042'));
    expect(roundTrip(selected, slugs)).toEqual(selected);
  });

  it('restores the default, falling back to stored prefs when nothing is in the URL', () => {
    const savedOff = new Set(['agency-001']);
    const back = roundTrip(new Set(slugs), slugs, savedOff);
    expect(back.has('agency-001')).toBe(false);
    expect(back.size).toBe(499);
  });
});

describe('parseAgencyUrlRule', () => {
  it('reads include and exclude lists, accepting commas too', () => {
    expect(parseAgencyUrlRule('?agencies=ttc,yrt.miway')).toEqual({ kind: 'include', slugs: new Set(['ttc', 'yrt', 'miway']) });
    expect(parseAgencyUrlRule('hide=go-transit')).toEqual({ kind: 'exclude', slugs: new Set(['go-transit']) });
  });

  it('prefers agencies when both are present, and ignores empty values', () => {
    expect(parseAgencyUrlRule('agencies=ttc&hide=yrt')?.kind).toBe('include');
    expect(parseAgencyUrlRule('agencies=&hide=yrt')?.kind).toBe('exclude');
    expect(parseAgencyUrlRule('agencies=..')).toBeNull();
    expect(parseAgencyUrlRule('day=Saturday')).toBeNull();
  });
});

describe('unknown or removed slugs', () => {
  const slugs = ['ttc', 'yrt', 'miway'];

  it('ignores unknown slugs in an include list', () => {
    const rule = settleAgencyUrlRule(parseAgencyUrlRule('agencies=ttc.gone-agency'), slugs);
    expect(slugs.filter(s => !isAgencyOff(s, rule, new Set()))).toEqual(['ttc']);
  });

  it('ignores unknown slugs in an exclude list', () => {
    const rule = settleAgencyUrlRule(parseAgencyUrlRule('hide=gone-agency.yrt'), slugs);
    expect(slugs.filter(s => !isAgencyOff(s, rule, new Set()))).toEqual(['ttc', 'miway']);
  });

  it('falls back to stored prefs when an include list matches no real agency', () => {
    const rule = settleAgencyUrlRule(parseAgencyUrlRule('agencies=gone-a.gone-b'), slugs);
    expect(rule).toBeNull();
    expect(slugs.filter(s => !isAgencyOff(s, rule, new Set(['miway'])))).toEqual(['ttc', 'yrt']);
  });
});

describe('precedence over stored prefs', () => {
  const savedOff = new Set(['ttc']);

  it('URL rule overrides the stored off-list', () => {
    const include = parseAgencyUrlRule('agencies=ttc');
    expect(isAgencyOff('ttc', include, savedOff)).toBe(false);
    expect(isAgencyOff('yrt', include, savedOff)).toBe(true);
    const exclude = parseAgencyUrlRule('hide=yrt');
    expect(isAgencyOff('ttc', exclude, savedOff)).toBe(false);
    expect(isAgencyOff('yrt', exclude, savedOff)).toBe(true);
  });

  it('stored off-list applies with no URL rule', () => {
    expect(isAgencyOff('ttc', null, savedOff)).toBe(true);
    expect(isAgencyOff('yrt', null, savedOff)).toBe(false);
  });

  it('does not overwrite stored prefs from a shared link until the viewer changes the selection', () => {
    const rule = parseAgencyUrlRule('agencies=ttc');
    expect(shouldPersistAgencySelection(rule, false)).toBe(false);
    expect(shouldPersistAgencySelection(rule, true)).toBe(true);
    expect(shouldPersistAgencySelection(null, false)).toBe(true);
  });
});

describe('mode filter param', () => {
  const allowed = [{ id: 0 }, { id: 1 }, { id: 3 }, { id: 100 }, { id: -1 }];

  it('round-trips through the URL', () => {
    const modes = new Set([3, 100, -1]);
    const qs = mergeUrlSearchParams('', { m: encodeModesParam(modes) });
    expect(qs).toBe('m=-1.3.100');
    expect(parseModesParam(qs, allowed)).toEqual(modes);
  });

  it('leaves no restriction out of the URL', () => {
    expect(encodeModesParam(new Set())).toBeNull();
    expect(parseModesParam('day=Saturday', allowed)).toEqual(new Set());
  });

  it('drops unknown or malformed modes', () => {
    expect(parseModesParam('m=3,7,bus,1.5', allowed)).toEqual(new Set([3, 1]));
    expect(parseModesParam('m=-1.3', [{ id: 3 }])).toEqual(new Set([3]));
  });
});

describe('on-demand stays out of public builds (CIV-50)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('turns the feature off and drops the on-demand mode from a shared URL', async () => {
    vi.resetModules();
    vi.stubEnv('VITE_ATLAS_MODE', 'public');
    const { ATLAS_MODE, FEATURES } = await import('../../../shared/config');
    const shareUrl = await import('../shareUrlState');
    expect(ATLAS_MODE).toBe('public');
    expect(FEATURES.onDemand).toBe(false);
    expect(shareUrl.AVAILABLE_FILTER_MODES.some(m => m.id === -1)).toBe(false);
    expect(shareUrl.parseModesParam('m=-1')).toEqual(new Set());
  });
});

describe('compare side B in the URL', () => {
  const opts = { days: ['Weekday', 'Saturday', 'Sunday'] as const, periods: ['all', 'midday', 'late'] as const, allPeriod: 'all' as const, fallbackHeadway: 10 };

  it('round-trips day, time and frequency', () => {
    for (const side of [
      { day: 'Weekday', period: 'late', maxHeadway: 15 },
      { day: 'Sunday', period: 'all', maxHeadway: Infinity },
      { day: 'Saturday', period: 'midday', maxHeadway: 10 },
    ] as const) {
      const url = mergeUrlSearchParams('?h=10&p=late&z=12', encodeCompareSideParams(side));
      expect(parseCompareSideParams(url, opts)).toEqual(side);
    }
  });

  it('always writes B\'s frequency, even when it matches A, so a shared link reproduces both sides', () => {
    expect(encodeCompareSideParams({ day: 'Weekday', period: 'late', maxHeadway: 10 })).toEqual({ cday: 'Weekday', cp: 'late', ch: '10' });
    expect(encodeCompareSideParams({ day: 'Weekday', period: 'late', maxHeadway: Infinity }).ch).toBe('all');
  });

  it('clears every compare param when compare is off', () => {
    expect(mergeUrlSearchParams('?cday=Saturday&cp=late&ch=15&h=10', encodeCompareSideParams(null))).not.toMatch(/cday|cp=|ch=/);
  });

  it('older links without a B frequency copy A\'s', () => {
    expect(parseCompareSideParams('cday=Saturday&cp=late', opts)).toEqual({ day: 'Saturday', period: 'late', maxHeadway: 10 });
    expect(parseCompareSideParams('cday=Saturday&cp=late&ch=junk', opts)?.maxHeadway).toBe(10);
    expect(parseCompareSideParams('cday=Saturday&ch=-5', opts)).toEqual({ day: 'Saturday', period: 'all', maxHeadway: 10 });
  });

  it('is not a compare link without a known day', () => {
    expect(parseCompareSideParams('cp=late&ch=15', opts)).toBeNull();
    expect(parseCompareSideParams('cday=Funday&ch=15', opts)).toBeNull();
  });

  it('reads frequency values the same way as h', () => {
    expect(parseHeadwayValue('all')).toBe(Infinity);
    expect(parseHeadwayValue('20')).toBe(20);
    expect(parseHeadwayValue('0')).toBeNull();
    expect(parseHeadwayValue(null)).toBeNull();
  });
});
