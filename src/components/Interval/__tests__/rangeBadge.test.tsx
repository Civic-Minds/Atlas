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
  it('takes the row\'s own colour number where it is slower, as a one-number row would (LA Metro 53: every 10–20 beside every 20)', () => {
    const { container } = render(<RouteDirectionRow label="to Downtown" headway={20} trunkHeadway={10} colorHeadway={22} />);
    const dot = container.querySelector('span.rounded-full') as HTMLElement;
    expect(dot.style.background).toBe(render(<span style={{ background: headwayToTierColor(22) }} />).container.querySelector('span')!.style.background);
  });
  it('a route list row keeps a long value in its column on two left-aligned lines (CIV-1300, OC Transpo 6 midday)', () => {
    const { container } = render(<RouteDirectionRow label="6 Greenboro ↔ Rockcliffe" routeName={{ shortName: '6', name: 'Greenboro ↔ Rockcliffe' }} headway={15} colorHeadway={32} headwayLabel="every 15 min, with one 32 min gap" />);
    const lines = [...container.querySelectorAll('span.flex.flex-col.items-start > span')].map(el => el.textContent);
    expect(lines).toEqual(['every 15 min,', 'with one 32 min gap']);
    expect(container.querySelector('div.flex.flex-wrap')).toBeNull();
  });
});
