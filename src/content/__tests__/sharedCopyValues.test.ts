import { describe, expect, it } from 'vitest';
import { COMPARE_LABEL, DEFAULT_EXPORT_TITLE, FEEDBACK_LABEL, FREQUENCY_LABEL, FILTERS_BOTH_MAPS_LABEL, FILTERS_LABEL, HISTORY_BUTTON_LABEL, HISTORY_TAG, LIVE_TAB_LABEL, LOCAL_STOP_WITHIN_LABEL, MORE_LABEL, NO_ROUTES_NEARBY, noLocalRouteWithinText, notWithinLead, SCHEDULED_COLUMN, USUALLY_COLUMN } from '../noticeCopy';
import { REPORT_DETAIL_LABELS } from '../../utils/reportIssue';
import { headwayAmount } from '../../../shared/headwayText';
import { MAX_CONNECTION_WINDOW } from '../../../shared/connections';
import { FREQUENT_GRADES } from '../../../shared/frequentService';
import { NIGHT_GRADES } from '../../../shared/nightService';
import { DEFAULT_MAX_HEADWAY, MAP_ZOOM_HEADWAY_STEPS, NEARBY_ROUTES_RADIUS_M, NO_HEADWAY_LIMIT } from '../../../shared/rules/limits';

/**
 * CIV-1814: text and numbers that were typed by hand now come from one home each. Every value here is the text the
 * screen showed before, so a change to a home that would change those screens fails here first.
 */
describe('shared copy keeps the text the screens showed (CIV-1814)', () => {
  it('keeps each label word for word', () => {
    expect([FILTERS_BOTH_MAPS_LABEL, LOCAL_STOP_WITHIN_LABEL, USUALLY_COLUMN, SCHEDULED_COLUMN, FEEDBACK_LABEL, DEFAULT_EXPORT_TITLE, FILTERS_LABEL, REPORT_DETAIL_LABELS.agency, LIVE_TAB_LABEL, HISTORY_BUTTON_LABEL, COMPARE_LABEL, MORE_LABEL, HISTORY_TAG, FREQUENCY_LABEL])
      .toEqual(['Filters for both maps', 'Local stop within', 'Usually', 'Scheduled', 'Feedback', 'Transit map', 'Filters', 'Agency', 'Live', 'History', 'Compare', 'More', 'History', 'Frequency']);
  });

  it('builds the sentences that hold a number from the number’s home', () => {
    expect(NEARBY_ROUTES_RADIUS_M).toBe(500);
    expect(NO_ROUTES_NEARBY).toBe('No routes within 500 m.');
    expect(noLocalRouteWithinText(headwayAmount(MAX_CONNECTION_WINDOW))).toBe('No local route within 60 min.');
    expect(notWithinLead(headwayAmount(MAX_CONNECTION_WINDOW))).toBe('Not within 60 min: ');
    expect([headwayAmount(15), headwayAmount(30)]).toEqual(['15 min', '30 min']);
  });

  it('keeps the grades and the no-limit zoom step', () => {
    expect(NIGHT_GRADES).toEqual([30, 60, 90]);
    expect(FREQUENT_GRADES).toEqual([15, 30]);
    expect(MAP_ZOOM_HEADWAY_STEPS.at(-1)).toEqual([9, NO_HEADWAY_LIMIT]);
    expect(NO_HEADWAY_LIMIT).toBe(9999);
    // CIV-1812 item 8: the map opens on every 60 min, and the phone Filters count leaves that default out.
    expect(DEFAULT_MAX_HEADWAY).toBe(60);
  });
});
