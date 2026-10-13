import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FrequencyBar } from '../pageParts';

const legendItems = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('ul li')).map(li => li.textContent);

describe('FrequencyBar legend', () => {
  it('puts the unit on the first band when the 10-minute band is empty', () => {
    const { container } = render(<FrequencyBar counts={[0, 0, 0, 0, 3, 0, 0]} />);
    expect(legendItems(container)).toEqual(['3 31–60 min']);
  });

  it('keeps the unit on the 10-minute band when it is visible', () => {
    const { container } = render(<FrequencyBar counts={[2, 0, 1, 0, 0, 0, 0]} />);
    expect(legendItems(container)).toEqual(['2 ≤10 min', '1 16–20']);
  });

  it('never puts the unit on "no midday" alone', () => {
    const { container } = render(<FrequencyBar counts={[0, 0, 0, 0, 0, 0, 2]} />);
    expect(legendItems(container)).toEqual(['2 no midday']);
  });

  it('puts the unit on the first frequency band, not on the no-midday item', () => {
    const { container } = render(<FrequencyBar counts={[0, 1, 0, 0, 0, 2, 1]} />);
    expect(legendItems(container)).toEqual(['1 11–15 min', '2 60+', '1 no midday']);
  });

  it('renders the bar group label', () => {
    render(<FrequencyBar counts={[1, 1, 0, 0, 0, 0, 0]} />);
    expect(screen.getByRole('group', { name: 'Routes by weekday midday frequency' })).toBeTruthy();
  });
});
