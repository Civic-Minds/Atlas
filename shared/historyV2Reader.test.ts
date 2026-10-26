import { describe, expect, it } from 'vitest';
import {
  parseHistoryAgencyV2,
  parseHistoryV2Sidecar,
  routesForYear,
  snapshotFlag,
  snapshotValue,
  yearsAvailable,
  parseHistoryShapes,
  shapeForYear,
  shapeYears,
  historyV2ShapesUrl,
  historyV2AgencyUrl,
  historyV2SidecarUrl,
  HISTORY_V2_BASE_OVERRIDE,
} from './historyV2Reader';

const sidecar = {
  version: 2,
  slug: 'demo',
  periodKey: '20200905',
  refDate: '20200901',
  futureField: { anything: 1 },
  routes: {
    '1': { name: 'One', rep: { h: 12, p: { amPeak: 10, midday: 12, pmPeak: 10, evening: 20, late: null, overnight: null } }, sat: { h: 30 }, sun: { none: true } },
    '2': { rep: { lim: true }, flag: 'limited', extra: 1 },
    '3': { rep: { h: 1.5 }, flag: 'fast' },
  },
};

const v2 = (refDate: string, rep: object, extra: object = {}) => ({ refDate, key: 'A', rep, ...extra });
const agency = {
  slug: 'demo',
  name: 'Demo',
  routes: [
    {
      routeShortName: 'A', routeName: 'Alpha',
      snapshots: [
        { label: 'Sep 2018', year: 2018, weekdayHeadwayMin: 40 },
        { label: 'Sep 2020', year: 2020, weekdayHeadwayMin: 20, periodKey: '20200905', v2: v2('20200901', { h: 20 }, { sat: { h: 30 }, sun: { none: true }, flag: undefined }) },
      ],
    },
    {
      routeShortName: 'B', routeName: 'Beta',
      snapshots: [{ label: 'Sep 2020', year: 2020, weekdayHeadwayMin: 400, periodKey: '20200905', v2: v2('20200902', { h: 400 }, { flag: 'slow' }) }],
    },
  ],
};

describe('parseHistoryV2Sidecar', () => {
  it('accepts a sidecar and ignores unknown fields', () => {
    const r = parseHistoryV2Sidecar(sidecar);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(Object.keys(r.value.routes)).toEqual(['1', '2', '3']);
      expect(r.value.routes['1'].sun).toEqual({ none: true });
      expect(r.value.routes['2'].sat).toBeUndefined();
    }
  });

  it('returns typed errors and never throws', () => {
    for (const bad of [null, 5, [], 'x']) expect(parseHistoryV2Sidecar(bad)).toMatchObject({ ok: false, error: { code: 'not-object' } });
    expect(parseHistoryV2Sidecar({ ...sidecar, version: 3 })).toMatchObject({ error: { code: 'unsupported-version' } });
    expect(parseHistoryV2Sidecar({ ...sidecar, version: undefined })).toMatchObject({ error: { code: 'missing-field', path: 'version' } });
    expect(parseHistoryV2Sidecar({ ...sidecar, refDate: '2020-09-01' })).toMatchObject({ error: { code: 'bad-field', path: 'refDate' } });
    expect(parseHistoryV2Sidecar({ ...sidecar, routes: undefined })).toMatchObject({ error: { code: 'missing-field', path: 'routes' } });
    expect(parseHistoryV2Sidecar({ ...sidecar, routes: { 1: { rep: { h: 0 } } } })).toMatchObject({ error: { path: 'routes.1.rep.h' } });
    expect(parseHistoryV2Sidecar({ ...sidecar, routes: { 1: { rep: { h: 5 }, sat: { h: 0 } } } })).toMatchObject({ error: { path: 'routes.1.sat' } });
    expect(parseHistoryV2Sidecar({ ...sidecar, routes: { 1: { rep: { h: 5 }, sat: { none: false } } } })).toMatchObject({ error: { path: 'routes.1.sat' } });
    expect(parseHistoryV2Sidecar({ ...sidecar, routes: { 1: { rep: { h: 5 }, flag: 'huge' } } })).toMatchObject({ error: { path: 'routes.1.flag' } });
    expect(parseHistoryV2Sidecar({ ...sidecar, routes: { 1: { rep: { h: 5, lim: true } } } })).toMatchObject({ error: { code: 'bad-field' } });
  });
});

describe('parseHistoryAgencyV2', () => {
  it('accepts mixed v1 and v2 snapshots', () => {
    expect(parseHistoryAgencyV2(agency).ok).toBe(true);
  });
  it('rejects bad shapes with a path', () => {
    expect(parseHistoryAgencyV2({ routes: [] })).toMatchObject({ error: { code: 'missing-field', path: 'slug' } });
    expect(parseHistoryAgencyV2({ slug: 'x', routes: [{ routeShortName: 'A', snapshots: [{ label: 'x', year: 2020, weekdayHeadwayMin: 0 }] }] }))
      .toMatchObject({ error: { path: 'routes.0.snapshots.0.weekdayHeadwayMin' } });
    expect(parseHistoryAgencyV2({ slug: 'x', routes: [{ routeShortName: 'A', snapshots: [{ label: 'x', year: 2020, weekdayHeadwayMin: 5, v2: { refDate: 'bad', key: 'A', rep: {} } }] }] }))
      .toMatchObject({ error: { path: 'routes.0.snapshots.0.v2.refDate' } });
  });
});

describe('snapshotValue', () => {
  const snaps = agency.routes[0].snapshots;
  it('v2: value, none, blank', () => {
    expect(snapshotValue(snaps[1], 'weekday')).toEqual({ kind: 'value', min: 20 });
    expect(snapshotValue(snaps[1], 'sat')).toEqual({ kind: 'value', min: 30 });
    expect(snapshotValue(snaps[1], 'sun')).toEqual({ kind: 'none' });
    expect(snapshotValue(agency.routes[1].snapshots[0], 'sat')).toEqual({ kind: 'blank' });
  });
  it('v2: limited and blank weekday', () => {
    const base = { label: 'x', year: 2020, weekdayHeadwayMin: 0 };
    expect(snapshotValue({ ...base, v2: v2('20200901', { lim: true }, { sat: { lim: true } }) }, 'weekday')).toEqual({ kind: 'limited' });
    expect(snapshotValue({ ...base, v2: v2('20200901', { lim: true }, { sat: { lim: true } }) }, 'sat')).toEqual({ kind: 'limited' });
    expect(snapshotValue({ ...base, v2: v2('20200901', {}) }, 'weekday')).toEqual({ kind: 'blank' });
  });
  it('v1 fallback: weekday from weekdayHeadwayMin, weekend blank', () => {
    expect(snapshotValue(snaps[0], 'weekday')).toEqual({ kind: 'value', min: 40 });
    expect(snapshotValue(snaps[0], 'sat')).toEqual({ kind: 'blank' });
    expect(snapshotValue(snaps[0], 'sun')).toEqual({ kind: 'blank' });
    expect(snapshotFlag(snaps[0])).toBeUndefined();
  });
  it('never returns 0 for unknown', () => {
    expect(snapshotValue({ label: 'x', year: 2020, weekdayHeadwayMin: 0 }, 'weekday')).toEqual({ kind: 'blank' });
  });
  it('flags are readable', () => {
    expect(snapshotFlag(agency.routes[1].snapshots[0])).toBe('slow');
  });
});

describe('routesForYear / yearsAvailable', () => {
  it('lists only routes with a snapshot that year, with period and refDate', () => {
    const y2018 = routesForYear(agency, 2018);
    expect(y2018.map(r => r.route.routeShortName)).toEqual(['A']);
    expect(y2018[0].refDate).toBeUndefined();
    const y2020 = routesForYear(agency, 2020);
    expect(y2020.map(r => [r.route.routeShortName, r.refDate, r.periodKey])).toEqual([['A', '20200901', '20200905'], ['B', '20200902', '20200905']]);
    expect(routesForYear(agency, 2019)).toEqual([]);
  });
  it('picks the latest refDate if data ever carries two in a year', () => {
    const dup = { routes: [{ routeShortName: 'A', snapshots: [
      { label: 'a', year: 2020, weekdayHeadwayMin: 10, v2: v2('20200301', { h: 10 }) },
      { label: 'b', year: 2020, weekdayHeadwayMin: 11, v2: v2('20200901', { h: 11 }) },
    ] }] };
    expect(routesForYear(dup, 2020)[0].snapshot.weekdayHeadwayMin).toBe(11);
  });
  it('years ascending and unique', () => {
    expect(yearsAvailable(agency)).toEqual([2018, 2020]);
  });
});

describe('fixture urls', () => {
  it('builds paths and has no override in tests', () => {
    expect(historyV2AgencyUrl('/dev-history-v2', 'marta')).toBe('/dev-history-v2/marta-v2-agency.json');
    expect(historyV2SidecarUrl('/b', 'marta', '2013')).toBe('/b/history-v2/marta/2013.json');
    expect(HISTORY_V2_BASE_OVERRIDE).toBeUndefined();
  });
});

describe('History v2 route shapes', () => {
  const file = {
    version: 1, slug: 'demo', decimals: 5, toleranceM: 15, futureField: 1,
    shapes: [[[-84.4, 33.7], [-84.3, 33.8]], [[-84.4, 33.7], [-84.35, 33.75], [-84.2, 33.9]]],
    approx: [1],
    years: { '2014': { '1': 0, '2': 1 }, '2015': { '1': 0 } },
  };

  it('validates a good file, keeps unknown fields and never throws on junk', () => {
    const r = parseHistoryShapes(file);
    expect(r.ok).toBe(true);
    if (r.ok) expect((r.value as unknown as { futureField: number }).futureField).toBe(1);
    for (const junk of [null, 5, 'x', [], {}, { version: 1 }]) expect(parseHistoryShapes(junk).ok).toBe(false);
    expect(parseHistoryShapes({ ...file, version: 2 })).toMatchObject({ ok: false, error: { code: 'unsupported-version' } });
    expect(parseHistoryShapes({ ...file, shapes: [[[1, 2]]] })).toMatchObject({ ok: false, error: { path: 'shapes.0' } });
    expect(parseHistoryShapes({ ...file, shapes: [[[1, 2], [Number.NaN, 2]]] }).ok).toBe(false);
    expect(parseHistoryShapes({ ...file, years: { '2014': { '1': 9 } } })).toMatchObject({ ok: false, error: { path: 'years.2014.1' } });
    expect(parseHistoryShapes({ ...file, years: { x: {} } }).ok).toBe(false);
    expect(parseHistoryShapes({ ...file, approx: [7] }).ok).toBe(false);
  });

  it('shapeForYear returns that year\'s line, flags approximate lines, and never falls back', () => {
    const parsed = parseHistoryShapes(file);
    if (!parsed.ok) throw new Error('fixture invalid');
    const f = parsed.value;
    expect(shapeForYear(f, '1', 2014)).toEqual({ kind: 'shape', coordinates: f.shapes[0], approximate: false });
    expect(shapeForYear(f, '1', 2015)).toEqual({ kind: 'shape', coordinates: f.shapes[0], approximate: false });
    expect(shapeForYear(f, '2', 2014)).toMatchObject({ kind: 'shape', approximate: true });
    // route 2 has no 2015 entry: none, not its 2014 line
    expect(shapeForYear(f, '2', 2015)).toEqual({ kind: 'none' });
    expect(shapeForYear(f, '1', 2016)).toEqual({ kind: 'none' });
    expect(shapeForYear(f, '9', 2014)).toEqual({ kind: 'none' });
    expect(shapeForYear(null, '1', 2014)).toEqual({ kind: 'none' });
    expect(shapeForYear(undefined, '1', 2014)).toEqual({ kind: 'none' });
    // an unvalidated, damaged file still returns none instead of throwing
    expect(shapeForYear({ ...f, shapes: [] }, '1', 2014)).toEqual({ kind: 'none' });
    expect(shapeYears(f)).toEqual([2014, 2015]);
  });

  it('v1 snapshots with an old geometry field stay readable and are not a shape source', () => {
    const agency = { slug: 'demo', routes: [{ routeShortName: '1', snapshots: [{ label: 'Jan 2014', year: 2014, weekdayHeadwayMin: 10, geometry: [[1, 2], [3, 4]] }] }] };
    const r = parseHistoryAgencyV2(agency);
    expect(r.ok).toBe(true);
    expect(shapeForYear(undefined, '1', 2014)).toEqual({ kind: 'none' });
  });

  it('builds the shapes URL', () => {
    expect(historyV2ShapesUrl('/dev-history-v2', 'marta')).toBe('/dev-history-v2/marta-v2-shapes.json');
  });
});
