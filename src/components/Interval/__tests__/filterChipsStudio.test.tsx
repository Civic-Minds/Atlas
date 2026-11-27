import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { FilterChips } from '../FilterChips';
import { AGENCIES_FILTER_LABEL, DAY_LABEL, FREQUENCY_LABEL, MODE_LABEL, TIME_LABEL } from '../../../content/noticeCopy';

// CIV-2940 (#1814): Studio's map with no page open colours its lines by frequency, so it gets the map's own Frequency,
// Day, Time and Mode chips and no Agencies toggle (Ryan picked 5). The main map's full row keeps its Agencies chip.
const props = {
  maxHeadway: Infinity,
  setMaxHeadway: () => {},
  selectedModes: new Set<number>(),
  setSelectedModes: () => {},
  day: 'Weekday' as const,
  setDay: () => {},
  period: 'all' as const,
  setPeriod: () => {},
  agencies: [],
  selectedAgencies: new Set<string>(),
  setSelectedAgencies: () => {},
  bounds: null,
};

const chipLabels = (variant: 'studio' | 'full') => {
  const { container } = render(<FilterChips {...props} variant={variant} />);
  return [...container.querySelectorAll('button')].map(b => b.textContent?.trim() ?? '');
};

describe('FilterChips studio variant', () => {
  it('shows Frequency, Day, Time and Mode, and no Agencies', () => {
    expect(chipLabels('studio')).toEqual([FREQUENCY_LABEL, DAY_LABEL, TIME_LABEL, MODE_LABEL]);
  });
  it('leaves the main map\'s Agencies chip in place', () => {
    expect(chipLabels('full')).toContain(AGENCIES_FILTER_LABEL);
  });
});
