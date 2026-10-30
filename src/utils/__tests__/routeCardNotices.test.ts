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
    expect(n.showFooter).toBe(true);
  });

  it('an agency under review with its own correction note shows the footer block, with N5 standing in for N4', () => {
    const shown = routeCardNotices({ ...base, agency: { feedReviewStatus: 'review', overrideNote: 'Fixed stop names.' }, routeOverrideNote: 'Fixed stop names.' });
    expect(shown.footer.map(f => f.code)).toEqual(['N5']);
    // The note is for other routes: the block still draws (empty), as before CIV-1200.
    const elsewhere = routeCardNotices({ ...base, agency: { feedReviewStatus: 'review', overrideNote: 'Fixed stop names.' } });
    expect(elsewhere.footer).toEqual([]);
    expect(elsewhere.showFooter).toBe(true);
  });

  it('puts variants under the title, booking below the rows, and nothing else on a plain card', () => {
    const n = routeCardNotices({ ...base, variantShortNames: ['51A', '51B'], directions: [{ bookingRequired: true } as any] });
    expect(n.variants).toMatchObject({ code: 'N15', place: 1, text: 'Includes variants 51A, 51B' });
    expect(n.booking).toMatchObject({ code: 'N16', place: 3 });
    expect([n.filter, n.period, n.footer.length, n.showFooter]).toEqual([null, null, 0, false]);
  });

  it('notes a direction with no rows in the period on the rows (place 2), not on the Night card', () => {
    const groups = [{ dirId: 1, boundLabel: 'Northbound', hasVisibleRows: false, onlySharedPasses: false, rows: [] }];
    const withSections = { ...model, groups, showDirectionSections: true } as unknown as RouteCardNoticeInput['model'];
    expect(routeCardNotices({ ...base, model: withSections }).directions).toEqual([{ dirId: 1, kind: 'no-service', text: 'No midday service.', place: 2 }]);
    expect(routeCardNotices({ ...base, model: withSections, nightView: true }).directions).toEqual([]);
  });
});
