import { describe, expect, it } from 'vitest';
import { routeCardNotices, type RouteCardNoticeInput } from '../routeCardNotices';
import { formatPeriodRangeLong } from '../../../shared/config';

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
    expect(plain(n.period?.text)).toContain(named);
  });
});
