import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import RouteDirectionRow from '../RouteDirectionRow';

// CIV-1000: the trunk-to-branch range is the shared HeadwayBadge, coloured by the trunk value.
describe('route row range badge', () => {
  it('draws "every 6–12 min" as the shared badge with the same look', () => {
    const { container } = render(<RouteDirectionRow label="to Broadview" headway={12} trunkHeadway={6} />);
    const badge = [...container.querySelectorAll('span.inline-flex.font-black')].find(el => /every 6–12 min/.test(el.textContent ?? ''));
    expect(badge).toBeTruthy();
    expect(badge!.className).toContain('font-black');
    expect(badge!.className).toContain('shrink-0');
    expect(badge!.querySelector('span.rounded-full')).not.toBeNull();
  });
});
