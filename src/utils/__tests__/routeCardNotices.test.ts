import { describe, expect, it } from 'vitest';
import { routeCardNotices, type RouteCardNoticeInput } from '../routeCardNotices';

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
    expect(routeCardNotices({ ...base, model: withSections }).directions).toEqual([{ dirId: 1, kind: 'no-service', text: 'No midday service.', place: 2 }]);
    expect(routeCardNotices({ ...base, model: withSections, nightView: true }).directions).toEqual([]);
  });
});

// A card whose rows read `rows` (headway, and the words beside it), for the "each fact once" rules (CIV-1202).
function withRows(rows: Array<{ headway: number | null; label?: string; limited?: boolean }>, extra: Record<string, unknown> = {}) {
  const cardRows = rows.map(r => ({
    display: () => ({ value: { headway: r.headway, headwayLabel: r.label, rowNoRegular: false, isLimited: !!r.limited }, limitedLabel: undefined }),
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

  it('#1226: never says "No frequency is shown" beside a row that shows one', () => {
    // Trips from 10 AM to noon only, inside midday (9 AM–3 PM).
    const directions = [{ headsign: 'A', departuresByHour: { 10: 3, 11: 3 } } as any];
    const partial = (rows: Parameters<typeof withRows>[0]) => withRows(rows, { hasPeriodService: false, hasPartialPeriodService: true });
    const plain = routeCardNotices({ ...base, directions, model: partial([]) });
    expect(plain.period?.text).toMatch(/^This route runs only from .* in this period\. No frequency is shown\.$/);
    const shown = routeCardNotices({ ...base, directions, model: partial([{ headway: 12 }]) });
    expect(shown.period?.text).toMatch(/^This route runs only from .* in this period\.$/);
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
