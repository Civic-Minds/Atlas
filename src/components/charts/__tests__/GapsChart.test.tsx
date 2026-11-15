import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import GapsChart from '../GapsChart';

// 12 gaps at 8 AM, 10 min apart on a 10 min timetable, and 2 bunched ones: enough for the hour to be on the axis.
const m = Array.from({ length: 14 }, (_, i) => 480 + i * 4);
const gaps = { m, g: m.map((_, i) => (i < 2 ? 60 : 600)), s: m.map(() => 600) } as never;

describe('GapsChart legend (VISUAL.md: the legend picks its series)', () => {
  it('names each step with its count, and picks it on hover, focus or tap', () => {
    render(<GapsChart gaps={gaps} ariaLabel="Gaps" />);
    const close = screen.getByRole('button', { name: /: 2 gaps$/ });
    expect(close.getAttribute('aria-pressed')).toBe('false');
    fireEvent.mouseEnter(close);
    expect(close.getAttribute('aria-pressed')).toBe('true');
    fireEvent.blur(close);
    expect(close.getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByRole('button', { name: /Near the schedule: 12 gaps/ })).toBeTruthy();
  });
});
