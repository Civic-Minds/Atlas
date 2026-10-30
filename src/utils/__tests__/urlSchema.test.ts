import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import sharedLinks from './fixtures/shared-links.json';
import {
  APP_URL, FREQUENT_URL, HISTORY_VIEW_URL, LIVE_AGENCY_URL, LIVE_BAND_IDS, LIVE_MAP_URL, LIVE_MEASURE_IDS, LIVE_ROUTE_URL, LIVE_TOOL_URL,
  MAP_URL, NIGHT_URL, linkUpdate, readLink, type UrlParam,
} from '../urlSchema';
import {
  encodeCompareSideParams, encodeHistoryUrlState, encodeModesParam, parseAgencyCardParam, parseAgencyUrlRule, parseCompareSideParams,
  parseHistoryUrlState, parseModesParam, AGENCIES_PARAM,
} from '../shareUrlState';
import { mergeUrlSearchParams } from '../syncUrlParams';
import { parseHistoryView, encodeHistoryView } from '../historyViewUrl';
import { DAY_TYPES } from '../../../shared/dayTypes';
import { PERIOD_KEYS } from '../../../shared/config';
import { BANDS } from '../../components/Live/sections/figures';
import { MEASURES } from '../../components/Live/routeMapModel';
import { SEGMENT_BAND_OPTIONS } from '../segmentDelayView';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Table = Record<string, UrlParam<any>>;

/** The tables each page reads, by path. The map stays mounted under History, Night, Frequent Service and Live. */
function tablesFor(path: string): Table[] {
  const { highlight: _debugOnly, ...map } = MAP_URL;
  // History's h and p are read through parseHistoryView below (it always writes both).
  if (path.startsWith('/apps/history')) return [];
  if (/^\/apps\/live\/[^/]+\/[^/]+/.test(path)) return [LIVE_ROUTE_URL];
  if (path.startsWith('/apps/live')) return [map, APP_URL, LIVE_MAP_URL];
  if (path.startsWith('/research/night') || path.startsWith('/apps/night')) return [map, APP_URL, NIGHT_URL];
  if (path.startsWith('/research/frequent-service')) return [map, APP_URL, FREQUENT_URL];
  if (path === '/' || path === '/apps/frequency') return [map, APP_URL];
  return [];
}

/** Everything a page reads from its link. */
function linkState(path: string, search: string) {
  const isMap = !path.startsWith('/apps/history') && !/^\/apps\/live\/[^/]+\/[^/]+/.test(path) && tablesFor(path).length > 0;
  const rule = isMap ? parseAgencyUrlRule(search) : null;
  return {
    tables: tablesFor(path).map(t => readLink(search, t)),
    history: path.startsWith('/apps/history') ? { ...parseHistoryUrlState(search), view: parseHistoryView(search, new Date(2026, 9, 29, 12)) } : null,
    agencies: rule ? { kind: rule.kind, slugs: [...rule.slugs].sort() } : null,
    modes: isMap ? [...parseModesParam(search)].sort() : null,
    operator: isMap ? parseAgencyCardParam(search) : null,
    compare: isMap ? parseCompareSideParams(search, { days: DAY_TYPES, periods: [...PERIOD_KEYS, 'all'], allPeriod: 'all', fallbackHeadway: 60 }) : null,
  };
}

/** The link each page writes for that state, from an empty query. Values the link didn't carry are left out. */
function writeLink(path: string, state: ReturnType<typeof linkState>): string {
  let qs = '';
  const tables = tablesFor(path);
  state.tables.forEach((values, i) => {
    const defined = Object.fromEntries(Object.entries(values).filter(([, v]) => v !== undefined));
    qs = mergeUrlSearchParams(qs, linkUpdate(tables[i], defined));
  });
  if (state.history) {
    const { view, ...h } = state.history;
    qs = mergeUrlSearchParams(qs, encodeHistoryUrlState(h, 0));
    qs = mergeUrlSearchParams(qs, encodeHistoryView(view));
  }
  if (state.agencies) qs = mergeUrlSearchParams(qs, { [AGENCIES_PARAM]: state.agencies.kind === 'include' ? state.agencies.slugs.join('.') : null, hide: state.agencies.kind === 'exclude' ? state.agencies.slugs.join('.') : null });
  if (state.modes) qs = mergeUrlSearchParams(qs, { m: encodeModesParam(new Set(state.modes)) });
  if (state.operator) qs = mergeUrlSearchParams(qs, { operator: state.operator });
  if (state.compare) qs = mergeUrlSearchParams(qs, encodeCompareSideParams(state.compare));
  return qs;
}

const links = (sharedLinks as { links: string[] }).links;
const split = (link: string) => { const i = link.indexOf('?'); return i < 0 ? [link, ''] : [link.slice(0, i), link.slice(i + 1)]; };

describe('real shared links keep opening the same view (CIV-1139)', () => {
  it('has the collected links', () => {
    expect(links.length).toBeGreaterThan(70);
  });

  it.each(links)('%s', (link) => {
    const [path, search] = split(link);
    const first = linkState(path, search);
    const written = writeLink(path, first);
    expect(linkState(path, written)).toEqual(first);
    // Every value the link carried under a current key is written back under that key.
    const before = new URLSearchParams(search);
    const after = new URLSearchParams(written);
    for (const table of tablesFor(path)) for (const param of Object.values(table)) {
      if (before.get(param.key) && param.parse(before.get(param.key)!) !== undefined && param.serialize(param.parse(before.get(param.key)!)) != null) {
        expect(after.has(param.key), `${param.key} in ${link}`).toBe(true);
      }
    }
  });
});

describe('older names and odd values still read', () => {
  it('map frequency and period under older keys, written under the current ones', () => {
    const v = readLink('?headway=20&period=midday&d=Saturday', MAP_URL);
    expect([v.headway, v.period, v.day]).toEqual([20, 'midday', 'Saturday']);
    expect(linkUpdate(MAP_URL, { headway: v.headway, period: v.period, day: v.day })).toEqual({ h: '20', p: 'midday', day: 'Saturday' });
  });

  it('History reads the map h and p, and p=all as its default period (CIV-1097)', () => {
    expect(readLink('?h=all&p=all', HISTORY_VIEW_URL)).toEqual({ headway: Infinity, period: undefined });
    expect(readLink('?max=15&p=amPeak', HISTORY_VIEW_URL)).toEqual({ headway: 15, period: 'amPeak' });
  });

  it('Night and Frequent Service leave their defaults out', () => {
    expect(readLink('?nightFrequency=30', NIGHT_URL).frequency).toBe(30);
    expect(readLink('?nightFrequency=45', NIGHT_URL).frequency).toBeUndefined();
    expect(linkUpdate(NIGHT_URL, { frequency: 60 })).toEqual({ nightFrequency: null });
    expect(readLink('?days=Saturday,Weekday&frequency=30&window=extended', FREQUENT_URL)).toEqual({ days: ['Weekday', 'Saturday'], frequency: 30, window: 'extended' });
    expect(linkUpdate(FREQUENT_URL, { days: ['Weekday'], frequency: 15, window: 'daytime' })).toEqual({ days: null, frequency: null, window: null });
    expect(readLink('?days=Funday', FREQUENT_URL).days).toBeUndefined();
  });

  it('Live pages: direction, view, band, measure, sort', () => {
    expect(readLink('?dir=1&view=analysis', LIVE_ROUTE_URL)).toMatchObject({ dir: 1, view: 'analysis' });
    expect(readLink('?dir=&view=nope', LIVE_ROUTE_URL)).toMatchObject({ dir: undefined, view: undefined });
    expect(linkUpdate(LIVE_ROUTE_URL, { view: 'lite', dir: 0 })).toEqual({ view: null, dir: '0' });
    expect(linkUpdate(LIVE_ROUTE_URL, { view: 'explore', day: 'all', band: 'midday' })).toEqual({ view: 'explore', day: null, band: 'midday' });
    expect(readLink('?route=504&band=pmPeak&measure=bunching&seg=a>b', LIVE_TOOL_URL)).toMatchObject({ route: '504', band: 'pmPeak', measure: 'bunching', segment: 'a>b' });
    expect(linkUpdate(LIVE_TOOL_URL, { view: null, tab: null, measure: 'late' })).toEqual({ view: null, tab: null, measure: null });
    expect(readLink('?sort=delivered', LIVE_AGENCY_URL).sort).toBe('delivered');
    // Live's band shares p with the map's period, and is always written while a route is open.
    expect(readLink('?p=midday', LIVE_MAP_URL).band).toBe('midday');
    expect(readLink('?p=overnight', LIVE_MAP_URL).band).toBeUndefined();
    expect(linkUpdate(LIVE_MAP_URL, { band: 'all', details: true, dir: 2 })).toEqual({ p: 'all', view: 'details', dir: '2' });
  });

  it('the low-quality setting is written only when on', () => {
    expect(readLink('?quality=1', APP_URL).hideLowQuality).toBe(true);
    expect(readLink('?quality=0', APP_URL).hideLowQuality).toBe(false);
    expect(linkUpdate(APP_URL, { hideLowQuality: false })).toEqual({ quality: null });
  });
});

describe('the schema matches the controls', () => {
  it('Live band, measure and route-performance band lists', () => {
    expect(LIVE_BAND_IDS).toEqual(BANDS.map(([id]) => id));
    expect(LIVE_BAND_IDS).toEqual(SEGMENT_BAND_OPTIONS.map(o => o.id));
    expect(LIVE_MEASURE_IDS).toEqual(MEASURES.map(([id]) => id));
  });
});

describe('every link read and write goes through the schema (CIV-1139)', () => {
  const root = join(__dirname, '../../..');
  // App-wide switches and tracking tags, not view state.
  const ALLOWED = new Set(['src/lib/analytics.ts', 'src/lib/internalTest.ts', 'src/lib/devHints.ts', 'src/lib/liveReportData.ts', 'src/utils/urlSchema.ts']);
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) { if (name !== '__tests__' && name !== 'node_modules') walk(p); }
      else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) files.push(p);
    }
  };
  walk(join(root, 'src'));

  it('no view reads the page link by hand or writes a key named in place', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const rel = relative(root, file);
      if (ALLOWED.has(rel)) continue;
      readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
        if (/URLSearchParams\(window\.location\.search\)|location\.search\)\.get\(/.test(line) || /syncUrlParams\(\{\s*['"A-Za-z_]/.test(line)) offenders.push(`${rel}:${i + 1}`);
      });
    }
    expect(offenders).toEqual([]);
  });
});
