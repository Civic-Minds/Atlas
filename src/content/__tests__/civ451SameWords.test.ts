import { describe, expect, it } from 'vitest';
import {
  HISTORY_AGENCY_SEARCH_PLACEHOLDER,
  HISTORY_BACK_TO_AGENCIES,
  HISTORY_BUTTON_ACTIVE_LABEL,
  HISTORY_BUTTON_LABEL,
  HISTORY_CHART_LABEL,
  HISTORY_EXPAND_CHART,
  HISTORY_FREQUENCY_CHANGE_NOTE,
  HISTORY_TITLE,
  HISTORY_YEAR_HINT,
  HISTORY_YEAR_LABEL,
} from '../noticeCopy';

// CIV-451: History's labels moved from History.tsx and App.tsx into noticeCopy with the same words.
// The one approved change: the History button's screen-reader name is "History" (was "Historical service").
describe('CIV-451 History copy keeps the same words', () => {
  it('labels', () => {
    expect(HISTORY_TITLE).toBe('Historical service');
    expect(HISTORY_BUTTON_LABEL).toBe('History');
    expect(HISTORY_BUTTON_ACTIVE_LABEL).toBe('Back to frequency map');
    expect(HISTORY_BACK_TO_AGENCIES).toBe('All agencies');
    expect(HISTORY_YEAR_HINT).toBe('Older to newer');
    expect(HISTORY_YEAR_LABEL).toBe('History year');
    expect(HISTORY_EXPAND_CHART).toBe('Expand chart');
    expect(HISTORY_CHART_LABEL).toBe('Route history chart');
    expect(HISTORY_AGENCY_SEARCH_PLACEHOLDER).toBe('Find an agency…');
    expect(HISTORY_FREQUENCY_CHANGE_NOTE).toBe('This compares the oldest and newest weekday schedules available for this route.');
  });
});
