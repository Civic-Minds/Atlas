import { describe, expect, it } from 'vitest';
import { STEP_LABELS, STRIP_COLUMNS } from '../routeStripModel';
import { liveLateStopsTopCaption } from '../../../content/noticeCopy';
import { countWord } from '../../../../shared/numberText';

// CIV-1814: values the route strip and the late-stops caption once typed by hand now come from their one home; the
// words riders see are unchanged.
describe('Live values read from their one home (CIV-1814)', () => {
  it('keeps the bunching legend bands, built from the step limits', () => {
    expect(STEP_LABELS.bunching).toEqual(['Under 15%', '15–25%', '25% or more']);
  });
  it('keeps the strip table column names', () => {
    expect([STRIP_COLUMNS.stop, STRIP_COLUMNS.n]).toEqual(['Stop', 'Departures']);
  });
  it('names the late-stops list by its own count', () => {
    expect(liveLateStopsTopCaption(5)).toBe('The five stops with the highest share of late departures');
    expect([countWord(1), countWord(10), countWord(12)]).toEqual(['one', 'ten', '12']);
  });
});
