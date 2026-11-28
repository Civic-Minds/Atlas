import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import RouteDirectionRow from '../RouteDirectionRow';

// Ryan, 2026-11-27 ("Why is the number of vehicles on a third line instead of on the fist line like i asked"): a Live
// row is two lines: "to Keele" with "3 vehicles" at the right ("why would there be a dot here if the number of vehicles is
// right justified"), then "every 13 min · gaps 9–13 min".
describe('a Live destination row', () => {
  it('puts the vehicles on the label line and the frequency with its gaps on the line under it, with no third line', () => {
    const { container } = render(<RouteDirectionRow label="to Keele" labelEnd="3 vehicles" valueBelow headway={13} headwaySuffix="· gaps 9–13 min" labelWeight="regular" wrapLongValue />);
    const label = container.querySelector('[data-flag-label]');
    expect(label?.textContent).toBe('to Keele');
    expect(label?.nextElementSibling?.textContent).toBe('3 vehicles');
    expect(container.textContent).not.toContain('· 3 vehicles');
    expect(container.textContent).toContain('gaps 9–13 min');
    // The value cell takes its own line (basis-full) and no sub-label line is drawn.
    expect(container.querySelector('.basis-full')?.textContent).toContain('gaps 9–13 min');
    expect(container.querySelectorAll('.mt-0\\.5.block').length).toBe(0);
  });
});
