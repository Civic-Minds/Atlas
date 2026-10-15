import { describe, expect, it } from 'vitest';
import {
  encodeFullDayUrlState,
  encodeHistoryUrlState,
  parseFullDayUrlState,
  parseHistoryUrlState,
  type HistoryUrlState,
} from '../shareUrlState';
import { mergeUrlSearchParams } from '../syncUrlParams';

// The frequency map stays mounted under History and writes its own params into the same URL.
const MAP_PARAMS = 'route=ttc%3A%3A504&agencies=ttc.go&day=Saturday&lat=43.65&lon=-79.38&z=11.00';

const empty: HistoryUrlState = { agency: null, route: null, year: 0, regions: [], routeQuery: '', routeMode: null };

function historyRoundTrip(state: HistoryUrlState, latestYear: number) {
  const qs = mergeUrlSearchParams(MAP_PARAMS, encodeHistoryUrlState(state, latestYear));
  return { qs, parsed: parseHistoryUrlState(qs) };
}

describe('History URL state', () => {
  it('writes nothing for the default view', () => {
    const { qs } = historyRoundTrip(empty, 0);
    expect(qs).toBe(MAP_PARAMS);
  });

  it('round-trips agency, route, year, regions, route search and mode filter', () => {
    const state: HistoryUrlState = {
      agency: 'ttc',
      route: '504',
      year: 2019,
      regions: ['Washington DC', 'Ontario'],
      routeQuery: 'king st',
      routeMode: 'mode:0',
    };
    const { qs, parsed } = historyRoundTrip(state, 2025);
    expect(parsed).toEqual({ ...state, regions: ['Ontario', 'Washington DC'] });
    // The map's own params are untouched.
    const sp = new URLSearchParams(qs);
    expect(sp.get('route')).toBe('ttc::504');
    expect(sp.get('agencies')).toBe('ttc.go');
    expect(sp.get('day')).toBe('Saturday');
  });

  it('leaves the newest year out', () => {
    const { qs, parsed } = historyRoundTrip({ ...empty, agency: 'ttc', year: 2025 }, 2025);
    expect(new URLSearchParams(qs).has('year')).toBe(false);
    expect(parsed.year).toBe(0);
  });

  it('keeps region names with dots and spaces whole', () => {
    const { parsed } = historyRoundTrip({ ...empty, regions: ['Washington D.C.', 'Nouvelle-Aquitaine'] }, 0);
    expect(parsed.regions).toEqual(['Nouvelle-Aquitaine', 'Washington D.C.']);
  });

  it('clears its params when the view returns to the default', () => {
    const withState = mergeUrlSearchParams(MAP_PARAMS, encodeHistoryUrlState({
      agency: 'ttc', route: '504', year: 2019, regions: ['Ontario'], routeQuery: 'x', routeMode: 'subtype:brt',
    }, 2025));
    expect(mergeUrlSearchParams(withState, encodeHistoryUrlState(empty, 0))).toBe(MAP_PARAMS);
  });

  it('ignores bad values', () => {
    expect(parseHistoryUrlState('agency=ttc&year=abc&rmode=mode:bus')).toMatchObject({ agency: 'ttc', year: 0, routeMode: null });
    expect(parseHistoryUrlState('agency=ttc&year=19')).toMatchObject({ year: 0 });
    // Route, year, search and mode only mean something inside an agency.
    expect(parseHistoryUrlState('hroute=504&year=2019&rq=king&rmode=mode:3')).toEqual(empty);
    expect(encodeHistoryUrlState({ ...empty, route: '504', routeQuery: 'king' }, 0)).toMatchObject({ hroute: null, rq: null });
  });
});

describe('Full-day chart URL state', () => {
  it('writes nothing while closed', () => {
    expect(encodeFullDayUrlState({ open: false, direction: 'direction-1-1' }, 'direction-0-0')).toEqual({ fullday: null, fdir: null });
  });

  it('round-trips open and a non-default direction', () => {
    const qs = mergeUrlSearchParams(MAP_PARAMS, encodeFullDayUrlState({ open: true, direction: 'direction-1-1' }, 'direction-0-0'));
    expect(parseFullDayUrlState(qs)).toEqual({ open: true, direction: 'direction-1-1' });
    expect(new URLSearchParams(qs).get('route')).toBe('ttc::504');
  });

  it('leaves the default direction out', () => {
    const qs = mergeUrlSearchParams('', encodeFullDayUrlState({ open: true, direction: 'direction-0-0' }, 'direction-0-0'));
    expect(qs).toBe('fullday=1');
    expect(parseFullDayUrlState(qs)).toEqual({ open: true, direction: null });
  });

  it('reads nothing from an unrelated link', () => {
    expect(parseFullDayUrlState(MAP_PARAMS)).toEqual({ open: false, direction: null });
  });
});
