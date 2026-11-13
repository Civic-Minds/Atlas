import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import RouteDirectionRow from '../RouteDirectionRow';
import { headwayToTierColor } from '../../../utils/colors';

// CIV-1000: the trunk-to-branch range is the shared HeadwayBadge. CIV-1447: coloured by its slower number.
describe('route row range badge', () => {
  it('draws "every 6–12 min" as the shared badge with the same look', () => {
    const { container } = render(<RouteDirectionRow label="to Broadview" headway={12} trunkHeadway={6} />);
    const badge = [...container.querySelectorAll('span.inline-flex.font-black')].find(el => /every 6–12 min/.test(el.textContent ?? ''));
    expect(badge).toBeTruthy();
    expect(badge!.className).toContain('font-black');
    expect(badge!.className).toContain('shrink-0');
    expect(badge!.querySelector('span.rounded-full')).not.toBeNull();
  });

  it('colours the range by its slower number, never the main stretch\'s (Ryan, CIV-1447: NJ Transit 27 "every 15–54" takes 54\'s colour)', () => {
    expect(headwayToTierColor(54)).not.toBe(headwayToTierColor(15));
    const { container } = render(<RouteDirectionRow label="to Irvington via Pru Ctr" headway={54} trunkHeadway={15} colorHeadway={15} />);
    const dot = container.querySelector('span.rounded-full') as HTMLElement;
    expect(dot.style.background).toBe(render(<span style={{ background: headwayToTierColor(54) }} />).container.querySelector('span')!.style.background);
  });
});
