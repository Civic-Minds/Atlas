import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { HeadwayBadge, LimitedBadge } from '../cardUi';

// #1128: a part-period value can break after its comma, so it never runs past the card edge.
describe('part-period badges', () => {
  it('splits "from 7:05am, every 20 min" into two whole parts that may wrap', () => {
    const { container } = render(<HeadwayBadge headway={20} label="from 7:05am, every 20 min" />);
    const parts = [...container.querySelectorAll('span.whitespace-nowrap')].map(el => el.textContent);
    expect(parts).toEqual(['from 7:05am,', 'every 20 min']);
    expect(container.querySelector('.flex-wrap')).not.toBeNull();
  });

  it('does the same for a limited value', () => {
    const { container } = render(<LimitedBadge label="until 9:05pm, every 20 min" />);
    expect(container.textContent).toBe('until 9:05pm, every 20 min');
    expect(container.querySelector('.flex-wrap')).not.toBeNull();
  });

  it('keeps a plain value on one line', () => {
    const { container } = render(<HeadwayBadge headway={10} />);
    expect(container.querySelector('.flex-wrap')).toBeNull();
  });
});
