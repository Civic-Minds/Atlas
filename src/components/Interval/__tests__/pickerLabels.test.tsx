import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { render, screen } from '@testing-library/react';
import { HEADWAY_TIERS } from '../../../utils/colors';
import { headwayTierLabel } from '../../../utils/headwayText';
import { CompareSidePicker } from '../CompareControl';
import { FrequencyPicker, frequencyOptionLabel, useFrequencyOptions } from '../pickers';

const maxes = HEADWAY_TIERS.map(t => t.max);
const SHORT = ['≤10 min', '≤15 min', '≤20 min', '≤30 min', '≤60 min'];

function Options() {
  const options = useFrequencyOptions();
  return <ul>{options.map(o => <li key={o.key}>{o.label}</li>)}</ul>;
}

describe('frequency picker labels', () => {
  it('one function gives the short labels, and no limit reads "All"', () => {
    expect(maxes.map(m => frequencyOptionLabel(m))).toEqual([...SHORT, 'All']);
    expect(SHORT).toEqual(maxes.filter(isFinite).map(headwayTierLabel));
  });

  it('chip pickers (phone panel, Settings) render the shared labels', () => {
    render(<FrequencyPicker value={Infinity} onChange={() => {}} />);
    for (const l of [...SHORT, 'All']) expect(screen.getByText(l)).toBeTruthy();
  });

  it('the desktop dropdown rows render the shared labels', () => {
    render(<Options />);
    for (const l of [...SHORT, 'All']) expect(screen.getByText(l)).toBeTruthy();
  });

  it('Compare shows the same visible labels, with no sentence wording', () => {
    const side = { maxHeadway: 10, day: 'Weekday', period: 'all' } as never;
    const { container } = render(<CompareSidePicker side={side} onChange={() => {}} />);
    for (const l of [...SHORT, 'All']) expect(screen.getAllByText(l).length).toBeGreaterThan(0);
    expect(container.textContent).not.toContain('or better');
  });

  it('no picker builds its own frequency wording', () => {
    for (const f of ['CompareControl', 'FilterPanel', 'FilterChips']) {
      const src = readFileSync(`src/components/Interval/${f}.tsx`, 'utf8');
      expect(src).not.toMatch(/or better|style="plain"/);
    }
  });
});
