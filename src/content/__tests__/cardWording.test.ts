import { describe, expect, it } from 'vitest';
import {
  IRREGULAR_OVERNIGHT_LABEL, IRREGULAR_PERIOD_LABEL, IRREGULAR_PERIOD_SHORT_LABEL, NO_LIMITED_ROUTES_IN_VIEW, PART_TIME_LABEL,
  PART_TIME_ROUTES_NOUN, PART_TIME_ROUTES_SEARCH, PART_TIME_ROUTES_TITLE, noSearchMatchText,
  noNumberRowLabel, noServiceInPeriodText, noServiceOnDayNotice, periodServiceNotice, selectedRouteFilterNotice,
  selectedRouteOutsideFilterNotice, selectedRoutePartMeetsFilterNotice, stopRunsOnlyText,
} from '../noticeCopy';
import { headwayPeriodShape } from '../../../shared/headwayText';
import { periodEdgeText } from '../../utils/effectiveHeadway';
import { NO_MIDDAY_SHORT, noMiddayBarSentence } from '../../../shared/agencyPages';

// CIV-1251: Ryan approved _review/card-wording word for word on 2026-11-01. Each builder's text against the page's own words,
// with only the invisible line-keeping characters (word joiners, no-break spaces) taken out.
const plain = (text: string) => text.replace(/⁠/g, '').replace(/[  ]/g, ' ');

describe('card wording (CIV-1251), word for word', () => {
  it.each([
    ['row 2: one gap', headwayPeriodShape({ every: 42, gap: 65 }), 'every 42 min, with one 65 min gap'],
    ['row 3: no number', periodServiceNotice('6–9 AM', true, '7–9 AM'), 'This route runs only from 7–9 AM.'],
    ['row 3: with a number', selectedRouteFilterNotice({ headway: 45, activeRange: '9 AM–1 PM', periodRange: '9 AM–3 PM' }), 'This route runs every 45 min, only from 9 AM–1 PM.'],
    ['row 3: no trips before', selectedRouteFilterNotice({ activeRange: '7–9 AM', periodRange: '6–9 AM', outside: [{ service: 'none', range: '6–7 AM' }] }), 'This route runs only from 7–9 AM. It has no trips from 6–7 AM.'],
    ['row 3: less often after', selectedRouteFilterNotice({ activeRange: '7–9 AM', periodRange: '6–9 AM', outside: [{ service: 'less', after: '9 AM' }] }), 'This route runs only from 7–9 AM. It runs less often after 9 AM.'],
    ['row 3: stop card', stopRunsOnlyText('7–9 AM'), 'Runs only from 7–9 AM'],
    ['row 4: cards', noNumberRowLabel({ period: 'midday', partTime: false }), IRREGULAR_PERIOD_LABEL],
    ['row 4: cards, either check', noNumberRowLabel({ period: 'midday', partTime: false, noRegular: true }), IRREGULAR_PERIOD_LABEL],
    ['row 4: tight spots', IRREGULAR_PERIOD_SHORT_LABEL, 'Irregular'],
    ['row 4: agency bar', noMiddayBarSentence(3), '3 routes run irregularly or not at all at midday'],
    ['row 4: agency bar, one', noMiddayBarSentence(1), '1 route runs irregularly or not at all at midday'],
    ['row 4: legend', NO_MIDDAY_SHORT, 'Irregular or none'],
    ['row 5: All day', noNumberRowLabel({ period: 'all', partTime: true }), 'Part-time'],
    ['row 5: All day, either check', noNumberRowLabel({ period: 'all', partTime: true, noRegular: true }), 'Part-time'],
    ['row 5: list title', PART_TIME_ROUTES_TITLE, 'Part-time routes'],
    ['row 5: list search', PART_TIME_ROUTES_SEARCH, 'Search part-time routes…'],
    ['row 5: list no match', noSearchMatchText(PART_TIME_ROUTES_NOUN), 'No part-time routes match your search.'],
    ['row 5: label', PART_TIME_LABEL, 'Part-time'],
    ['row 5: empty list', NO_LIMITED_ROUTES_IN_VIEW, 'No part-time routes in view.'],
    ['row 7: period', selectedRouteOutsideFilterNotice(Infinity, '6–9 AM'), 'This route has no trips from 6–9 AM.'],
    ['row 7: all day', selectedRouteOutsideFilterNotice(Infinity, null), 'This route has no trips all day.'],
    ['row 7: route on a day', noServiceOnDayNotice('route', 'Sunday'), 'This route has no trips on Sundays.'],
    ['row 7: agency on a day', noServiceOnDayNotice('agency', 'Sunday'), 'This agency has no trips on Sundays.'],
    ['row 7: a direction', noServiceInPeriodText('9 AM–3 PM'), 'No trips from 9 AM–3 PM'],
    ['row 9', selectedRoutePartMeetsFilterNotice(15, '3–7 PM'), 'Only the shared stretch runs every 15 min or better from 3–7 PM.'],
    ['row 9: one direction', selectedRoutePartMeetsFilterNotice(15, '3–7 PM', 'Northbound'), 'Northbound, only the shared stretch runs every 15 min or better from 3–7 PM.'],
    ['row 10', selectedRouteOutsideFilterNotice(15, '6–9 AM'), "This route doesn't run every 15 min or better for all of 6–9 AM."],
    ['row 10: all day', selectedRouteOutsideFilterNotice(15, null), "This route doesn't run every 15 min or better all day."],
    ['row 8: shared stretch time', periodEdgeText({ from: 487, every: 15 }), 'every 15 min from 8:07 AM'],
    ['row 11', IRREGULAR_OVERNIGHT_LABEL, 'Runs irregularly overnight'],
    ['row 11: one function', noNumberRowLabel({ period: 'overnight', partTime: false, nightView: true }), 'Runs irregularly overnight'],
    ['row 11: Night, whatever the period', noNumberRowLabel({ period: 'midday', partTime: false, nightView: true, noRegular: true }), 'Runs irregularly overnight'],
  ])('%s', (_name, built, approved) => {
    expect(plain(built)).toBe(approved);
  });
});
