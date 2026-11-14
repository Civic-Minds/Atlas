import { describe, expect, it } from 'vitest';
import { minutesText, tenth } from '../../../../shared/liveFormat';
import { METHOD_TITLE } from '../../../../shared/liveWording';
import { headwayAmount, runTimeAmount, scheduledEveryText } from '../../../../shared/headwayText';
import { LIVE_METHOD_DRAW_ERROR } from '../../../content/noticeCopy';
import {
  LESS_EXACT, NOT_MEASURED_CELL, NOT_MEASURED_KEY, SHOW_KEY_STOPS, STRIP_COLUMNS, STRIP_ROLE, TRACK_NAME,
  fewerThanText, gapsOffText, showAllStopsText, stripTableCaption,
} from '../routeStripModel';

// CIV-1160: Live strings moved onto shared constants and helpers. Each must read exactly as the hand-written literal it replaced.
describe('CIV-1160: same words after moving Live copy to shared definitions', () => {
  it('"Scheduled every" reads as the old template, rounding and missing value included', () => {
    for (const m of [10, 7.4, 7.5, 0, 120, null, undefined, NaN]) {
      expect(scheduledEveryText(m)).toBe(`Scheduled every ${headwayAmount(m)}`);
    }
    expect(scheduledEveryText(10)).toBe('Scheduled every 10 min');
    expect(scheduledEveryText(7.5)).toBe('Scheduled every 8 min');
    expect(scheduledEveryText(null)).toBe('Scheduled every —');
  });

  it('KPI tile minutes read as the old hand-built text', () => {
    for (const x of [0, 0.4, 0.5, 12, 41.6, 42.49, -0.4, 90]) {
      expect(runTimeAmount(x)).toBe(`${Math.round(x)} min`);
      expect(minutesText(x)).toBe(`${tenth(x)} min`);
    }
    expect(runTimeAmount(41.6)).toBe('42 min');
    expect(minutesText(0.94)).toBe('0.9 min');
  });

  it('"How this is measured" heading and its draw error', () => {
    expect(METHOD_TITLE).toBe('How this is measured');
    expect(LIVE_METHOD_DRAW_ERROR).toBe('How this is measured could not be drawn.');
  });

  it('route strip and branch strip words', () => {
    expect(TRACK_NAME).toEqual({ delay: 'Delay', bunching: 'Bunching' });
    expect(stripTableCaption('Eastbound')).toBe('Eastbound: delay and bunching at each stop');
    expect(STRIP_COLUMNS).toEqual({ stop: 'Stop', delay: 'Typical delay', late: 'Late', bunch: 'Gaps off', n: 'Departures' });
    expect(NOT_MEASURED_CELL).toBe('not measured');
    expect(SHOW_KEY_STOPS).toBe('Show key stops only');
    expect(showAllStopsText(24)).toBe('Show all 24 stops');
    expect(STRIP_ROLE).toBe('route strip');
    expect(LESS_EXACT).toBe('Less exact');
    expect(fewerThanText(30)).toBe('Fewer than 30 departures or gaps');
    expect(NOT_MEASURED_KEY).toBe('Not measured');
    expect(gapsOffText('12%')).toBe('12% of gaps off');
  });
});
