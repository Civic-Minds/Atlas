import { describe, expect, it, vi } from 'vitest';
import { routeCardNotices, type RouteCardNoticeInput } from '../routeCardNotices';
import { formatPeriodRangeLong } from '../../../shared/config';
import { noServiceInPeriodText } from '../../content/noticeCopy';

// N123 reads the map's shared-stretch ranges from the agency's features: a test that passes any says part of the route qualifies.
vi.mock('../routeCardTrunk', async importOriginal => ({
  ...(await importOriginal<typeof import('../routeCardTrunk')>()),
  routePartMeetsFilter: (agencyFeatures: unknown) => (agencyFeatures != null ? [0] : []),
}));

// A card with service all period and no rows of note: only the inputs a test sets decide what shows.
const model = {
  contract: undefined, doesNotRun: false, hasPeriodService: true, hasPartialPeriodService: false,
  activeRangeDirections: [], rowHeadways: [], unevenGap: () => 0, groups: [], showDirectionSections: false,
} as unknown as RouteCardNoticeInput['model'];
const base: RouteCardNoticeInput = {
  directions: [{ headsign: 'A' } as any], model, period: 'midday', maxHeadway: 60, selectedRouteOutOfFilter: false,
  hideFilterNotices: false, unevenEnabled: true, routeIsStale: false, expDateStr: '', listingEndedDate: '', listingEnded: false,
};

describe('routeCardNotices (CIV-1200)', () => {
  it('keeps the footer order and gives each notice its place', () => {
    const n = routeCardNotices({
      ...base,
      directions: [{ noRouteShape: true, routeDataQualityWarning: 'shape-anomaly', weekdayTierVariation: true } as any],
      routeIsStale: true, expDateStr: 'May 1, 2026', listingEndedDate: 'Oct 1, 2026', listingEnded: true,
      agency: { name: 'TTC', feedReviewStatus: 'review' },
    });
    expect(n.footer.map(f => [f.code, f.place])).toEqual([['N7', 1], ['N6', 1], ['N25', 1], ['N2', 1], ['N4', 1], ['N1', 3]]);
  });

  it('an agency under review with its own correction note shows N5 in place of N4, only on the route it is for', () => {
    const shown = routeCardNotices({ ...base, agency: { feedReviewStatus: 'review', overrideNote: 'Fixed stop names.' }, routeOverrideNote: 'Fixed stop names.' });
    expect(shown.footer.map(f => f.code)).toEqual(['N5']);
    const elsewhere = routeCardNotices({ ...base, agency: { feedReviewStatus: 'review', overrideNote: 'Fixed stop names.' } });
    expect(elsewhere.footer).toEqual([]);
  });

  it('puts variants under the title, booking below the rows, and nothing else on a plain card', () => {
    const n = routeCardNotices({ ...base, variantShortNames: ['51A', '51B'], directions: [{ bookingRequired: true } as any] });
    expect(n.variants).toMatchObject({ code: 'N15', place: 1, text: 'Includes variants 51A, 51B' });
    expect(n.booking).toMatchObject({ code: 'N16', place: 3 });
    expect([n.filter, n.period, n.footer.length]).toEqual([null, null, 0]);
  });

  it('notes a direction with no rows in the period on the rows (place 2), not on the Night card', () => {
    const groups = [{ dirId: 1, boundLabel: 'Northbound', hasVisibleRows: false, onlySharedPasses: false, rows: [] }];
    const withSections = { ...model, groups, showDirectionSections: true } as unknown as RouteCardNoticeInput['model'];
    expect(routeCardNotices({ ...base, model: withSections }).directions).toEqual([{ dirId: 1, kind: 'no-service', text: noServiceInPeriodText(formatPeriodRangeLong(9, 15)), place: 2 }]);
    expect(routeCardNotices({ ...base, model: withSections, nightView: true }).directions).toEqual([]);
  });

  it('#1186: the part-period line names the hours inside the period, as the period line does', () => {
    // Trips in the hour before overnight (1 AM) and at 3 and 5 AM: the line used to read "runs from 1–2 AM, …".
    const night = { headsign: 'A', headwayByHour: { 25: 20, 27: 20, 29: 20 } } as any;
    const partial = { ...model, hasPeriodService: false, hasPartialPeriodService: true, activeRangeDirections: [night], contract: { filterValue: 60 } } as unknown as RouteCardNoticeInput['model'];
    const n = routeCardNotices({ ...base, directions: [night], model: partial, period: 'overnight', maxHeadway: 15, selectedRouteOutOfFilter: true });
    const named = `${formatPeriodRangeLong(27, 28)}, ${formatPeriodRangeLong(29, 30)}`;
    expect(n.filter?.code).toBe('N13');
    // The notices keep their ranges on one line (word joiners, no-break spaces).
    const plain = (text: string | undefined) => text?.replaceAll('\u2060', '').replace(/[\u00a0\u202f]/g, ' ');
    expect(plain(n.filter?.text)).toContain(named);
    expect(plain(n.filter?.text)).not.toContain(formatPeriodRangeLong(25, 26));
    // CIV-1251: the period line is now the same sentence, so it shows once.
    expect(n.period).toBeNull();
    expect(n.dropped).toContainEqual({ code: 'N9', why: 'the filter line says the same' });
  });

  it('#1186: never names another direction\'s hours; with none on the chart in the period the filter line stays (MiWay 49 midday)', () => {
    const early = { headsign: 'A', departuresByHour: { 6: 3, 7: 3, 8: 2 }, headwayByHour: { 6: 20, 7: 20, 8: 30 } } as any;
    const allDay = { headsign: 'B', departuresByHour: { 9: 2, 11: 2, 13: 2 }, headwayByHour: { 9: 45, 11: 45, 13: 45 } } as any;
    const m = { ...model, hasPeriodService: false, hasPartialPeriodService: true, activeRangeDirections: [early], contract: { filterValue: 45 } } as unknown as RouteCardNoticeInput['model'];
    const n = routeCardNotices({ ...base, directions: [early, allDay], model: m, period: 'midday', maxHeadway: 15, selectedRouteOutOfFilter: true });
    // Never the part-period line with another direction's hours. The filter line is N12, left out here only because
    // the period line already says when the route runs (CIV-1202, each fact once).
    expect(n.filter).toBeNull();
    expect(n.dropped).toEqual([{ code: 'N12', why: 'the period line says when it runs' }]);
    expect(n.period?.code).toBe('N9');
  });

  it('#1236: a 5 AM first trip runs in the overnight period (TTC 100), so the card says when, not "no scheduled trips"', () => {
    const pape = { headsign: 'Pape', departuresByHour: { 5: 3, 6: 12 }, headwayByHour: { 5: 5, 6: 5 } } as any;
    const m = { ...model, doesNotRun: true, hasPeriodService: false, hasPartialPeriodService: true, activeRangeDirections: [pape] } as unknown as RouteCardNoticeInput['model'];
    const n = routeCardNotices({ ...base, directions: [pape], model: m, period: 'overnight', maxHeadway: Infinity, selectedRouteOutOfFilter: true });
    const plain = (text: string | undefined) => text?.replaceAll('\u2060', '').replace(/[\u00a0\u202f]/g, ' ');
    expect(n.filter).toBeNull();
    expect(n.period?.code).toBe('N9');
    expect(plain(n.period?.text)).toContain(formatPeriodRangeLong(29, 30));
    // A route with no overnight trips at all keeps the line.
    const daytime = { headsign: 'Pape', departuresByHour: { 6: 12 }, headwayByHour: { 6: 5 } } as any;
    const none = { ...m, hasPartialPeriodService: false, activeRangeDirections: [daytime] } as unknown as RouteCardNoticeInput['model'];
    expect(routeCardNotices({ ...base, directions: [daytime], model: none, period: 'overnight', maxHeadway: Infinity, selectedRouteOutOfFilter: true }).filter?.code).toBe('N11');
  });

  it('#1277: a route with no rows but trips in the period says when, not "no scheduled trips" (TTC 110 Sunday AM)', () => {
    // First trip 7:52: a direction carries an AM value, so the period check passes, but the route reads as not running.
    const islington = { headsign: 'Islington', departuresByHour: { 7: 1, 8: 2, 9: 2 }, headwayByHour: { 7: 15, 8: 30, 9: 30 }, maxGapByHour: { 7: 30, 8: 30, 9: 30 } } as any;
    const m = { ...model, doesNotRun: true, hasPeriodService: true, hasPartialPeriodService: false, activeRangeDirections: [islington] } as unknown as RouteCardNoticeInput['model'];
    const n = routeCardNotices({ ...base, directions: [islington], model: m, period: 'amPeak', maxHeadway: Infinity, selectedRouteOutOfFilter: true });
    const plain = (text: string | undefined) => text?.replaceAll('⁠', '').replace(/[  ]/g, ' ');
    expect(n.filter).toBeNull();
    expect(n.period?.code).toBe('N9');
    expect(plain(n.period?.text)).toContain(formatPeriodRangeLong(7, 9));
    expect(plain(n.period?.text)).not.toContain('no scheduled trips');
    // With no trips inside 6-9 AM the line stays.
    const later = { headsign: 'Islington', departuresByHour: { 10: 2 }, headwayByHour: { 10: 30 }, maxGapByHour: { 10: 30 } } as any;
    const none = { ...m, activeRangeDirections: [later] } as unknown as RouteCardNoticeInput['model'];
    expect(routeCardNotices({ ...base, directions: [later], model: none, period: 'amPeak', maxHeadway: Infinity, selectedRouteOutOfFilter: true }).filter?.code).toBe('N11');
  });
});

// A card whose rows read `rows` (headway, and the words beside it), for the "each fact once" rules (CIV-1202).
function withRows(rows: Array<{ headway: number | null; label?: string; limited?: boolean; dimmed?: boolean; edge?: string; directionValue?: number }>, extra: Record<string, unknown> = {}) {
  const cardRows = rows.map(r => ({
    feature: r.directionValue != null ? { directionFilterHeadwayByPeriod: { evening: r.directionValue } } : undefined,
    display: () => ({ value: { headway: r.headway, headwayLabel: r.label ?? r.edge, edgeText: r.edge, dimmed: !!r.dimmed, rowNoRegular: false, isLimited: !!r.limited }, limitedLabel: undefined }),
  }));
  return { ...model, groups: [{ dirId: 0, shared: null, rows: cardRows, hasVisibleRows: true, onlySharedPasses: false }], ...extra } as unknown as RouteCardNoticeInput['model'];
}

describe('each fact once (CIV-1202)', () => {
  it('drops the gap line where a row already names the gap, and keeps it where no row does', () => {
    const named = routeCardNotices({ ...base, model: withRows([{ headway: 15, label: 'every 15 min, with a 32 min gap' }], { unevenGap: () => 32 }) });
    expect(named.period).toBeNull();
    expect(named.dropped).toEqual([{ code: 'N10', why: 'a row names that gap or a longer one' }]);
    // CTA 74 overnight: rows name 24–25 min gaps, the route's gap is 116. Both lines stay.
    const smaller = routeCardNotices({ ...base, model: withRows([{ headway: 20, label: 'every 20 min, with a 25 min gap' }], { unevenGap: () => 116 }), selectedRouteOutOfFilter: true, maxHeadway: 60 });
    expect(smaller.period?.code).toBe('N10');
    expect(smaller.dropped).toEqual([{ code: 'N12', why: 'the gap line says why' }]);
    const unnamed = routeCardNotices({ ...base, model: withRows([{ headway: 15 }], { unevenGap: () => 32 }) });
    expect(unnamed.period?.code).toBe('N10');
    // Not longer than a row's own wait: nothing to add.
    expect(routeCardNotices({ ...base, model: withRows([{ headway: 40 }], { unevenGap: () => 32 }) }).period).toBeNull();
  });

  it('#1225: shows "no scheduled trips" once when the filter line and the period line say the same', () => {
    // The route runs on other days, so it isn't "does not run"; at All both lines read the same sentence.
    const noTrips = { ...model, hasPeriodService: false } as unknown as RouteCardNoticeInput['model'];
    const n = routeCardNotices({ ...base, model: noTrips, selectedRouteOutOfFilter: true, maxHeadway: Infinity });
    expect([n.filter?.code, n.period]).toEqual(['N11', null]);
    expect(n.dropped).toEqual([{ code: 'N8', why: 'the filter line says the same' }]);
  });

  it('#1226, CIV-1251: the line says only when the route runs, with or without a number on the rows', () => {
    // Trips from 10 AM to noon only, inside midday (9 AM–3 PM).
    const directions = [{ headsign: 'A', departuresByHour: { 10: 3, 11: 3 } } as any];
    const partial = (rows: Parameters<typeof withRows>[0]) => withRows(rows, { hasPeriodService: false, hasPartialPeriodService: true });
    const plain = routeCardNotices({ ...base, directions, model: partial([]) });
    expect(plain.period?.text).toMatch(/^This route runs only from [^.]*\.$/);
    const shown = routeCardNotices({ ...base, directions, model: partial([{ headway: 12 }]) });
    expect(shown.period?.text).toBe(plain.period?.text);
    // No number on the rows, but a row gives the hours: the line would repeat it.
    const hours = routeCardNotices({ ...base, directions, model: partial([{ headway: null, limited: true, label: 'from 10:04 AM' }]) });
    expect([hours.period, hours.dropped]).toEqual([null, [{ code: 'N9', why: 'every row gives its hours' }]]);
    // One row with hours and one without: the line still says when the route runs.
    const oneRow = routeCardNotices({ ...base, directions, model: partial([{ headway: null, limited: true, label: 'from 10:04 AM' }, { headway: null, limited: true }]) });
    expect(oneRow.period?.code).toBe('N9');
  });

  it('#1227: drops "doesn\'t meet the filter" where every row shows a longer wait, or a row\'s gap says why', () => {
    const slower = routeCardNotices({ ...base, model: withRows([{ headway: 20 }, { headway: 30 }]), selectedRouteOutOfFilter: true, maxHeadway: 15 });
    expect(slower.filter).toBeNull();
    const gap = routeCardNotices({ ...base, model: withRows([{ headway: 15, label: 'every 15 min, with a 32 min gap' }]), selectedRouteOutOfFilter: true, maxHeadway: 15 });
    expect(gap.filter).toBeNull();
    // A row's gap within the filter doesn't say why the route misses it.
    const small = routeCardNotices({ ...base, model: withRows([{ headway: 10, label: 'every 10 min, with a 14 min gap' }]), selectedRouteOutOfFilter: true, maxHeadway: 15 });
    expect(small.filter?.code).toBe('N12');
    // OC Transpo 6 at ≤15: one direction names its gap, the other reads every 15.
    const oneGap = routeCardNotices({ ...base, model: withRows([{ headway: 15, label: 'every 15 min, with a 32 min gap' }, { headway: 15 }]), selectedRouteOutOfFilter: true, maxHeadway: 15 });
    expect(oneGap.filter).toBeNull();
    // Rows every 15 and nothing on the card saying why: the line stays.
    const unexplained = routeCardNotices({ ...base, model: withRows([{ headway: 15 }]), selectedRouteOutOfFilter: true, maxHeadway: 15 });
    expect(unexplained.filter?.code).toBe('N12');
  });
});

describe('CIV-1241: the part-route line and a row\'s until or from time say the same thing', () => {
  const partMeets = (rows: Parameters<typeof withRows>[0]) =>
    routeCardNotices({ ...base, model: withRows(rows), selectedRouteOutOfFilter: true, maxHeadway: 60, period: 'evening', agencyFeatures: [] });

  it('hides "Only part of this route runs …" when every row that falls short names its time (OC Transpo 11 evening)', () => {
    // The route's value dims both rows; only the direction every 102 falls short.
    const n = partMeets([{ headway: 26, dimmed: true, directionValue: 26 }, { headway: 30, dimmed: true, directionValue: 102, edge: 'every 30 min until 9:18 PM' }]);
    expect(n.filter).toBeNull();
    expect(n.dropped).toEqual([{ code: 'N123', why: 'every row that falls short gives its until or from time' }]);
  });

  it('keeps it while a row that falls short has no time of its own (AC Transit 22 Sunday midday)', () => {
    expect(partMeets([{ headway: 30, dimmed: true, directionValue: 30 }, { headway: 30, dimmed: true, directionValue: 168 }]).filter?.code).toBe('N123');
    expect(partMeets([{ headway: 30, dimmed: true, edge: 'every 30 min until 9:18 PM' }, { headway: 104, dimmed: true }]).filter?.code).toBe('N123');
    // A gap is not a time: the line stays.
    expect(partMeets([{ headway: 15, dimmed: true, edge: 'every 15 min, with a 30 min gap' }]).filter?.code).toBe('N123');
  });
});

describe('CIV-1251: the runs-only line shows once', () => {
  it('N9 beside N13, which opens with the same sentence, is left out (TTC 31 weekday overnight)', () => {
    const night = { headsign: 'A', headwayByHour: { 29: 20 }, departuresByHour: { 29: 3 } } as any;
    const partial = { ...model, hasPeriodService: false, hasPartialPeriodService: true, activeRangeDirections: [night], contract: { filterValue: 60 } } as unknown as RouteCardNoticeInput['model'];
    const n = routeCardNotices({ ...base, directions: [night], model: partial, period: 'overnight', maxHeadway: 15, selectedRouteOutOfFilter: true });
    if (n.filter?.code === 'N13') expect(n.period).toBeNull();
    expect([n.filter?.text, n.period?.text].filter(Boolean).filter(t => /runs only from/.test(t!))).toHaveLength(1);
  });
});

describe('CIV-1251: never "only from" the whole period', () => {
  it('a route running all of 3–7 PM in one direction, none in the other (OC Transpo 226), reads the filter line, not N13', () => {
    const east = { headsign: 'Chapel Hill', directionId: 0, headwayByHour: { 15: 27, 16: 27, 17: 27, 18: 27 }, departuresByHour: { 15: 2, 16: 2, 17: 2, 18: 2 } } as any;
    const m = { ...model, activeRangeDirections: [east], rowHeadways: [27], contract: { filterValue: null } } as unknown as RouteCardNoticeInput['model'];
    const n = routeCardNotices({ ...base, directions: [east], model: m, period: 'pmPeak', maxHeadway: Infinity, selectedRouteOutOfFilter: true });
    expect(n.filter?.code).not.toBe('N13');
  });
});


describe('#1343: a part-period notice that would name the whole period names the reference stop\'s hours', () => {
  // Bustang South, weekday evening (7–11 PM), as published: the chart's end-of-line counts fill the evening, while the
  // mid-route reference stop, where the period decision is read, has its last bus at 8:45 PM.
  const meta = (hours: Record<number, number>) => ({ main: { stops: 9, refStop: '26122', trips: 12, departuresByHour: hours }, tails: [] });
  const toDenver = { headsign: 'Denver', directionId: 0, departuresByHour: { 18: 1, 19: 1 }, stretchMeta: meta({ 18: 1, 19: 1 }) } as any;
  const toSprings = { headsign: 'Colorado Springs', directionId: 1, departuresByHour: { 19: 1, 20: 1, 21: 1, 22: 1 }, stretchMeta: meta({ 18: 1, 19: 1, 20: 1 }) } as any;
  const evening = { ...model, hasPeriodService: false, hasPartialPeriodService: true, activeRangeDirections: [toDenver, toSprings] } as unknown as RouteCardNoticeInput['model'];
  const plain = (t?: string) => (t ?? '').replace(/[ ⁠‑​]/g, ' ').replace(/\s*–\s*/g, '–');

  it('Bustang South: "runs only from 7–9 PM", not the whole evening', () => {
    const n = routeCardNotices({ ...base, directions: [toDenver, toSprings], model: evening, period: 'evening', maxHeadway: Infinity });
    expect(plain(n.period?.text)).toBe('This route runs only from 7–9 PM.');
    expect(n.period?.activeRange).not.toBe('7–11 PM');
  });

  it('legitimate: hours short of the period stay the chart\'s (#1186), even where the reference stop differs', () => {
    const only = { ...toSprings, departuresByHour: { 20: 1, 21: 1 } };
    const n = routeCardNotices({ ...base, directions: [only], model: { ...evening, activeRangeDirections: [only] }, period: 'evening', maxHeadway: Infinity });
    expect(plain(n.period?.text)).toBe('This route runs only from 8–10 PM.');
  });

  it('data from before #1343 (no reference-stop hours) keeps the chart\'s hours', () => {
    const old = [toDenver, toSprings].map(({ stretchMeta: _m, ...d }) => d);
    const n = routeCardNotices({ ...base, directions: old, model: { ...evening, activeRangeDirections: old }, period: 'evening', maxHeadway: Infinity });
    expect(plain(n.period?.text)).toBe('This route runs only from 7–11 PM.');
  });
});

describe('CIV-1199: each fact once (Ryan, 2026-11-14), on the audit\'s cards', () => {
  const plain = (t?: string | null) => (t ?? '').replace(/[⁠]/g, '').replace(/[  ]/g, ' ');
  const outOf = (m: RouteCardNoticeInput['model'], extra: Partial<RouteCardNoticeInput>) => routeCardNotices({ ...base, model: m, selectedRouteOutOfFilter: true, ...extra });

  it('N10: drops where a row names the gap (OC Transpo 6 midday, CTA 171 AM) or says until/from; stays where it adds the gap', () => {
    const oc6 = routeCardNotices({ ...base, model: withRows([{ headway: 15, label: 'every 15 min, with one 32 min gap' }, { headway: 15 }], { unevenGap: () => 32 }) });
    expect([oc6.period, oc6.dropped]).toEqual([null, [{ code: 'N10', why: 'a row names that gap or a longer one' }]]);
    const cta171 = routeCardNotices({ ...base, model: withRows([{ headway: 15, label: 'every 15 min, with one 30 min gap' }, { headway: 15, label: 'every 15 min, with one 30 min gap' }], { unevenGap: () => 30 }) });
    expect(cta171.period).toBeNull();
    const until = routeCardNotices({ ...base, model: withRows([{ headway: 15, label: 'every 15 min until 1:10 PM' }, { headway: 15 }], { unevenGap: () => 32 }) });
    expect(until.dropped).toEqual([{ code: 'N10', why: 'a row gives its hours, so the route does not run all period' }]);
    expect(routeCardNotices({ ...base, model: withRows([{ headway: 15 }, { headway: 15 }], { unevenGap: () => 32 }) }).period?.text).toBe('Gaps between trips can be up to 32 min.');
  });

  it('N8/N11: one "no trips" sentence per card (AC Transit 702 weekday AM at All)', () => {
    const none = { ...model, hasPeriodService: false } as unknown as RouteCardNoticeInput['model'];
    const n = outOf(none, { period: 'amPeak', maxHeadway: Infinity });
    expect([n.filter?.code, n.period]).toEqual(['N11', null]);
    expect(plain(n.filter?.text)).toBe('This route has no trips from 6–9 AM.');
  });

  it('N12: drops beside "no trips" (AC Transit 702 at ≤60) and where every row shows a longer wait', () => {
    const none = { ...model, hasPeriodService: false } as unknown as RouteCardNoticeInput['model'];
    const n702 = outOf(none, { period: 'amPeak', maxHeadway: 60 });
    expect([n702.filter, n702.period?.code]).toEqual([null, 'N8']);
    expect(n702.dropped).toEqual([{ code: 'N12', why: 'the period line says when it runs' }]);
    expect(outOf(withRows([{ headway: 63 }, { headway: 75 }]), { maxHeadway: 60 }).dropped).toEqual([{ code: 'N12', why: 'every row shows a longer wait' }]);
  });

  it('N12: every row meets the filter but the route runs only part of the period: the existing part-period line says when (question 2)', () => {
    // CTA 66 weekday late at ≤15: rows every 12 and 10; after 1 AM only a few trips, so the route's value is 30.
    const a = { headsign: 'A', headwayByHour: { 23: 10, 24: 11 }, maxGapByHour: { 23: 11, 24: 15 }, departuresByHour: { 23: 6, 24: 4 } } as any;
    const b = { headsign: 'B', headwayByHour: { 23: 8, 24: 10, 25: 2 }, departuresByHour: { 23: 4, 24: 1 } } as any;
    const dir = [a, b];
    const m = withRows([{ headway: 12 }, { headway: 10 }], { activeRangeDirections: dir, rowHeadways: [12, 10], contract: { filterValue: 30 } });
    const n = outOf(m, { directions: dir, period: 'late', maxHeadway: 15 });
    expect(n.filter?.code).toBe('N13');
    expect(plain(n.filter?.text)).toBe('This route runs every 12 min, only from 11 PM–1 AM. It runs less often after 1 AM.');
    expect(n.dropped).toEqual([{ code: 'N12', why: 'every row meets the filter; the part-period line says when it runs' }]);
    // Rows every 15 that run all period, nothing else on the card saying why: the filter line stays.
    expect(outOf(withRows([{ headway: 15 }]), { maxHeadway: 15 }).filter?.code).toBe('N12');
    // A row slower than the filter: no swap.
    expect(outOf(withRows([{ headway: 12 }, { headway: 20 }], { activeRangeDirections: dir, rowHeadways: [12, 20], contract: { filterValue: 30 } }), { directions: dir, period: 'late', maxHeadway: 15 }).filter?.code).toBe('N12');
  });

  it('N12: rows every 15 beside a row naming its gap read no filter line (OC Transpo 6 midday, AC Transit 1T late at ≤15)', () => {
    expect(outOf(withRows([{ headway: 15, label: 'every 15 min, with one 32 min gap' }, { headway: 15 }]), { maxHeadway: 15 }).filter).toBeNull();
  });

  // AC Transit 70 weekday AM: both directions start at 7 AM; one row reads "every 30 min from 7:14 AM".
  const ac70 = { headsign: 'A', headwayByHour: { 7: 30, 8: 30 }, maxGapByHour: { 7: 30, 8: 30 }, departuresByHour: { 7: 2, 8: 2 } } as any;
  const ac70Card = (edge: string) => outOf(
    withRows([{ headway: 30 }, { headway: 33, label: edge }], { activeRangeDirections: [ac70], rowHeadways: [30, 33], contract: { filterValue: 74 } }),
    { directions: [ac70], period: 'amPeak', maxHeadway: 15 },
  );

  it('N13: drops where a row gives the same hours with "from"/"until" (AC Transit 70 AM)', () => {
    const n = ac70Card('every 30 min from 7:14 AM');
    expect(n.filter).toBeNull();
    expect(n.dropped).toEqual([{ code: 'N13', why: 'a row gives the same hours' }]);
  });

  it('N13: stays where the row\'s hours are not the line\'s', () => {
    const n = ac70Card('every 30 min from 8:10 AM');
    expect(plain(n.filter?.text)).toBe('This route runs every 33 min, only from 7–9 AM. It has no trips from 6–7 AM.');
  });

  it('N9: keeps "runs only from" beside a row showing a frequency (CTA X4 AM)', () => {
    const x4 = { headsign: 'A', headwayByHour: { 7: 12, 8: 12 }, departuresByHour: { 7: 5, 8: 5 } } as any;
    const m = withRows([{ headway: 63, label: 'every 13 min from 7:03 AM' }, { headway: 12 }], { hasPeriodService: false, hasPartialPeriodService: true, activeRangeDirections: [x4] });
    const n = routeCardNotices({ ...base, directions: [x4], model: m, period: 'amPeak', maxHeadway: Infinity });
    expect(plain(n.period?.text)).toBe('This route runs only from 7–9 AM.');
  });

  it('N9: with no number on the rows, drops where a row gives the same hours', () => {
    const d = { headsign: 'A', departuresByHour: { 10: 3, 11: 3 } } as any;
    const partial = (rows: Parameters<typeof withRows>[0]) => withRows(rows, { hasPeriodService: false, hasPartialPeriodService: true, activeRangeDirections: [d] });
    const same = routeCardNotices({ ...base, directions: [d], model: partial([{ headway: null, limited: true, label: 'from 10:04 AM' }, { headway: null, limited: true, label: 'until 11:50 AM' }, { headway: null, limited: true }]) });
    expect([same.period, same.dropped]).toEqual([null, [{ code: 'N9', why: 'a row gives the same hours' }]]);
    // Only its start: the line still says when it ends.
    expect(routeCardNotices({ ...base, directions: [d], model: partial([{ headway: null, limited: true, label: 'from 10:04 AM' }, { headway: null, limited: true }]) }).period?.code).toBe('N9');
  });

  it('N9 beside N13 naming the same hours shows once (CTA 80 Sunday late)', () => {
    const d = { headsign: 'A', headwayByHour: { 23: 20 }, maxGapByHour: { 23: 20 }, departuresByHour: { 23: 3 } } as any;
    const m = withRows([{ headway: 20 }], { hasPeriodService: false, hasPartialPeriodService: true, activeRangeDirections: [d], rowHeadways: [20], contract: { filterValue: 80 } });
    const n = outOf(m, { directions: [d], period: 'late', maxHeadway: 60 });
    expect(n.filter?.code).toBe('N13');
    expect(n.period).toBeNull();
    expect(n.dropped).toContainEqual({ code: 'N9', why: 'the filter line says the same' });
  });
});
