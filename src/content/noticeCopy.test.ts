import { describe, expect, it } from 'vitest';
import { CARD_NOTICE, CARD_NOTICE_FOOTER } from '../styles';
import { listingEndedPanelLead, HIDE_DEGRADED_FEEDS_SETTING, HIDE_ONE_OFF_SETTING, HIDE_PART_TIME_SETTING, LIMITED_SERVICE_LABEL, IRREGULAR_PERIOD_LABEL, IRREGULAR_PERIOD_SHORT_LABEL, HIDDEN_ROUTES_UNAVAILABLE, NO_DEGRADED_FEEDS, NO_FEED_MATCHES, NO_LIMITED_ROUTES_IN_VIEW, NO_MATCHING_AGENCIES, NO_MATCHING_ROUTES, noSearchMatchText, storyMapFailedText, storyMapLoadingText, NEW_SCHEDULE_DATA_NOTICE, expiredFeedCheckHistory, expiredFeedNotice, nightNoRoutesNotice, noServiceOnDayNotice, selectedRouteFilterNotice, selectedRouteOutsideFilterNotice, stopNoRoutesNotice } from './noticeCopy';

describe('expiredFeedNotice', () => {
  it('names the agency once, without region or duplicated articles', () => {
    expect(expiredFeedNotice('Grand River Transit (Waterloo Region)', 'Apr 26, 2026')).toBe(
      "Grand River Transit's schedule ended on Apr 26, 2026. Times shown may be out of date.",
    );
  });

  it('omits the date when unknown', () => {
    expect(expiredFeedNotice('Grand River Transit')).toBe(
      "Grand River Transit's schedule ended. Times shown may be out of date.",
    );
  });

  it('reads the same for a timetable kept by hand (N3: the detail is in its explainer)', () => {
    expect(expiredFeedNotice('Grand River Transit', 'Apr 26, 2026', true)).toBe(expiredFeedNotice('Grand River Transit', 'Apr 26, 2026'));
  });
});

describe('expiredFeedCheckHistory', () => {
  it('reads as its own sentence', () => {
    expect(expiredFeedCheckHistory({ count: 5, since: '2026-06-22' })).toBe(
      "We've checked for a new schedule 5 times since Jun 22, 2026.",
    );
  });

  it('gives no last-checked date (CIV-1242)', () => {
    expect(expiredFeedCheckHistory({})).toBe('');
  });
});

describe('card notice styling', () => {
  it('is regular weight with no divider', () => {
    expect(CARD_NOTICE).toContain('font-normal');
    expect(CARD_NOTICE).not.toContain('font-bold');
    expect(CARD_NOTICE_FOOTER).not.toContain('border-t');
  });
});

describe('approved notice wording (CIV-1045)', () => {
  it('N12: the frequency filter', () => {
    expect(selectedRouteOutsideFilterNotice(15, '6–9 AM').replace(/\u2060/g, '').replace(/\u00a0/g, ' ')).toBe("This route doesn't run every 15 min or better for all of 6–9 AM.");
    // N11: the same times as N8.
    expect(selectedRouteOutsideFilterNotice(Infinity, '6–9 AM').replace(/\u2060/g, '').replace(/\u00a0/g, ' ')).toBe('This route has no trips from 6–9 AM.');
  });

  it('N13: names what the rest of the period has', () => {
    const base = { headway: 12, activeRange: '7–9 AM', periodRange: '6–9 AM' };
    const plain = (s: string) => s.replace(/\u2060/g, '').replace(/\u00a0/g, ' ');
    expect(plain(selectedRouteFilterNotice({ ...base, outside: [{ service: 'none', range: '6–7 AM' }] })))
      .toBe('This route runs every 12 min, only from 7–9 AM. It has no trips from 6–7 AM.');
    expect(plain(selectedRouteFilterNotice({ ...base, outside: [{ service: 'less', range: '6–7 AM' }] })))
      .toBe('This route runs every 12 min, only from 7–9 AM. It runs less often from 6–7 AM.');
    expect(plain(selectedRouteFilterNotice({ ...base, activeRange: '7–8 AM', outside: [{ service: 'none', range: '6–7 AM' }, { service: 'none', after: '8 AM' }] })))
      .toBe('This route runs every 12 min, only from 7–8 AM. It has no trips from 6–7 AM or after 8 AM.');
    expect(plain(selectedRouteFilterNotice({ ...base, activeRange: '7–8 AM', outside: [{ service: 'none', range: '6–7 AM' }, { service: 'less', after: '8 AM' }] })))
      .toBe('This route runs every 12 min, only from 7–8 AM. It has no trips from 6–7 AM. It runs less often after 8 AM.');
    expect(plain(selectedRouteFilterNotice({ ...base, outside: [{ service: 'unknown', range: '6–7 AM' }] })))
      .toBe('This route runs every 12 min, only from 7–9 AM.');
    // More than one run in the period: the general wording.
    expect(plain(selectedRouteFilterNotice(base))).toBe('This route runs every 12 min, only from 7–9 AM.');
    expect(plain(selectedRouteFilterNotice({ ...base, headway: null }))).toBe('This route runs only from 7–9 AM.');
  });

  it('N35: a stop with no routes in the chosen time', () => {
    expect(stopNoRoutesNotice('4–7 PM').replace(/\u2060/g, '').replace(/\u00a0/g, ' ')).toBe('No routes stop here from 4–7 PM.');
  });

  it('N52: the Night view with nothing to list', () => {
    expect(nightNoRoutesNotice(30)).toBe('No routes here run every 30 min or better from 2–5 AM.');
  });

  it('N17 and N26: no trips on the day (CIV-1077, CIV-1251)', () => {
    expect(noServiceOnDayNotice('route', 'Sunday')).toBe('This route has no trips on Sundays.');
    expect(noServiceOnDayNotice('agency', 'Weekday')).toBe('This agency has no trips on weekdays.');
  });
});

describe('N4 (CIV-1051)', () => {
  it('says verified, matching E2', () => {
    expect(NEW_SCHEDULE_DATA_NOTICE.route).toBe("This route's new schedule is still being verified.");
  });
});

// CIV-957: empty and loading states moved into this file read exactly as before.
describe('empty and loading states (CIV-957)', () => {
  it('keep their wording', () => {
    expect(NO_MATCHING_ROUTES).toBe('No routes match.');
    expect(NO_MATCHING_AGENCIES).toBe('No agencies match.');
    expect(noSearchMatchText('hidden routes')).toBe('No hidden routes match your search.');
    expect(noSearchMatchText('limited-service routes')).toBe('No limited-service routes match your search.');
    expect(NO_LIMITED_ROUTES_IN_VIEW).toBe('No part-time routes in view.');
    expect(HIDDEN_ROUTES_UNAVAILABLE).toBe('The hidden-route list is unavailable right now.');
    expect(NO_DEGRADED_FEEDS).toBe('No degraded or unusable feeds are currently recorded.');
    expect(NO_FEED_MATCHES).toBe('No feeds match your search or filter.');
    expect(storyMapLoadingText('MiWay')).toBe('Loading MiWay’s network…');
    expect(storyMapFailedText('MiWay')).toBe('The MiWay network preview is unavailable.');
  });
});

// CIV-957 item 2: route labels and setting definitions live here once. CIV-1238: Ryan's words for an irregular period.
describe('route labels and setting definitions (CIV-957)', () => {
  it('keep their wording', () => {
    expect(LIMITED_SERVICE_LABEL).toBe('limited');
    expect(IRREGULAR_PERIOD_LABEL).toBe('Runs irregularly in this period');
    expect(IRREGULAR_PERIOD_SHORT_LABEL).toBe('Irregular');
    expect(HIDE_ONE_OFF_SETTING).toEqual({ label: 'Hide occasional routes', description: 'School runs, a few trips a day, on-demand.' });
    expect(HIDE_PART_TIME_SETTING).toEqual({ label: 'Hide part-time routes', description: 'Only at rush hour, evenings, or some days.' });
    expect(HIDE_DEGRADED_FEEDS_SETTING.label).toBe('Hide degraded feeds');
  });
});

describe('E1, N25 version (CIV-1051)', () => {
  it('names the agency and switches tense', () => {
    expect(listingEndedPanelLead('Dutchess Transit', 'Oct 28, 2026', false)).toBe("Dutchess Transit's scheduled service for most routes ends Oct 28, 2026, and they have not released updated data. The map shows the last full week in their schedule, for every route.");
    expect(listingEndedPanelLead('Dutchess Transit', 'Oct 28, 2026', true)).toContain('most routes ended Oct 28, 2026,');
  });
});
