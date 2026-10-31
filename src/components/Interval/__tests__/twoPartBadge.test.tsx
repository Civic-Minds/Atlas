import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { HeadwayBadge, LimitedBadge } from '../cardUi';

// #1128: a part-period value can break before its limit, so it never runs past the card edge.
describe('part-period badges', () => {
  it('splits "every 20 min from 7:05 AM" into two whole parts that may wrap, frequency first', () => {
    const { container } = render(<HeadwayBadge headway={20} label="every 20 min from 7:05 AM" />);
    const parts = [...container.querySelectorAll('span.whitespace-nowrap')].map(el => el.textContent);
    expect(parts).toEqual(['every 20 min', 'from 7:05 AM']);
    expect(container.querySelector('.flex-wrap')).not.toBeNull();
  });

  it('still breaks a gap value after its comma', () => {
    const { container } = render(<HeadwayBadge headway={10} label="every 10 min, with a 45 min gap" />);
    const parts = [...container.querySelectorAll('span.whitespace-nowrap')].map(el => el.textContent);
    expect(parts).toEqual(['every 10 min,', 'with a 45 min gap']);
  });

  it('does the same for a limited value', () => {
    const { container } = render(<LimitedBadge label="every 20 min until 9:05 PM" />);
    expect(container.textContent).toBe('every 20 min until 9:05 PM');
    expect(container.querySelector('.flex-wrap')).not.toBeNull();
  });

  it('lets a several-word limited value break between words instead of running over the row (TTC 25 northbound AM)', () => {
    const { container } = render(<LimitedBadge label="no regular service during this period" />);
    expect(container.textContent).toBe('no regular service during this period');
    expect(container.querySelector('.whitespace-nowrap')).toBeNull();
    expect(container.querySelector('.shrink-0.whitespace-nowrap')).toBeNull();
    expect(container.firstElementChild?.className).toContain('min-w-0');
    expect(container.firstElementChild?.className).not.toContain('whitespace-nowrap');
  });

  it('keeps a one-word limited value on one line', () => {
    const { container } = render(<LimitedBadge label="limited" />);
    expect(container.firstElementChild?.className).toContain('whitespace-nowrap');
  });

  it('keeps a plain value on one line', () => {
    const { container } = render(<HeadwayBadge headway={10} />);
    expect(container.querySelector('.flex-wrap')).toBeNull();
  });
});
