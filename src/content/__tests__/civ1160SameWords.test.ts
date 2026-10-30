import { describe, expect, it } from 'vitest';
import {
  BACK_TO_MAP_LABEL,
  CLOSE_LABEL,
  COMPARE_B_PICKER_NOTE,
  DEFAULT_EXPORT_TITLE,
  FREQUENCY_LABEL,
  LIMITED_SERVICE_LABEL,
  noServiceInPeriodText,
  ON_DEMAND_SHADED_AREA_NOTE,
  ONLY_SHARED_SECTION_MEETS_FILTER,
  OTHER_REGION_LABEL,
  PRIVACY_SETTINGS_TITLE,
  RETRY_LABEL,
  SETTINGS_APPLY_TO_FREQUENCY_MAP,
  SHARED_STRETCH_LABEL,
} from '../noticeCopy';
import { FREQUENCY_LABEL as SPARKLINE_FREQUENCY_LABEL } from '../../components/Interval/HeadwaySparkline';
import { formatStoredDate } from '../../utils/format';
import { capitalizeFirst } from '../../utils/headwayText';

// CIV-1160: these texts moved from components into noticeCopy with the same words. Each must equal the old literal.
describe('CIV-1160 shared copy keeps the same words', () => {
  it('labels', () => {
    expect(BACK_TO_MAP_LABEL).toBe('Map');
    expect(OTHER_REGION_LABEL).toBe('Other');
    expect(SHARED_STRETCH_LABEL).toBe('Shared stretch');
    expect(FREQUENCY_LABEL).toBe('Frequency');
    expect(SPARKLINE_FREQUENCY_LABEL).toBe('Frequency');
    expect(DEFAULT_EXPORT_TITLE).toBe('Transit map');
    expect(PRIVACY_SETTINGS_TITLE).toBe('Privacy & analytics');
    expect(RETRY_LABEL).toBe('Retry');
    expect(CLOSE_LABEL).toBe('Close');
    expect(capitalizeFirst(LIMITED_SERVICE_LABEL)).toBe('Limited');
    expect(`A ${LIMITED_SERVICE_LABEL}`).toBe('A limited');
  });

  it('card sentences', () => {
    expect(ON_DEMAND_SHADED_AREA_NOTE).toBe('The shaded map area shows where this on-demand service operates.');
    expect(noServiceInPeriodText('Midday')).toBe('No midday service.');
    expect(noServiceInPeriodText('AM Peak')).toBe('No am peak service.');
    expect(ONLY_SHARED_SECTION_MEETS_FILTER).toBe('Only the shared section meets this filter. The branches do not.');
    expect(SETTINGS_APPLY_TO_FREQUENCY_MAP).toBe('These settings apply to the Frequency map.');
    expect(COMPARE_B_PICKER_NOTE).toBe('The frequency, day and time above are map A; pick map B here. Modes and agencies apply to both maps. Leave Compare from the More menu.');
  });

  it('formatStoredDate matches the old SidebarControls formatter for 8-digit dates', () => {
    // The inline formatter SidebarControls had before CIV-1160.
    const oldFormatter = (exp: string) => {
      const y = exp.slice(0, 4);
      const m = exp.slice(4, 6);
      const d = exp.slice(6, 8);
      const date = new Date(Date.UTC(parseInt(y), parseInt(m) - 1, parseInt(d)));
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
    };
    for (const exp of ['20261101', '20260101', '20261231', '20240229', '20250709']) {
      expect(formatStoredDate(exp)).toBe(oldFormatter(exp));
    }
    expect(formatStoredDate('20261101')).toBe('Nov 1, 2026');
  });
});
