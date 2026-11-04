import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import CardRouteList from '../CardRouteList';
import { getNightServiceTierColor, NIGHT_SERVICE_TIER_COLORS } from '../../../utils/colors';

// CIV-1329: the Night list's dots take the night shade of each route's grade, from the same colours as the map and key.
describe('CardRouteList dot colour', () => {
  it('draws the given night shade instead of the headway tier colour', () => {
    const rows = ([30, 60, 90] as const).map(grade => ({ key: String(grade), route: { primary: String(grade), secondary: '' }, headway: grade, dotColor: getNightServiceTierColor(grade) }));
    const { container } = render(<CardRouteList rows={rows} onSelect={() => {}} />);
    const dots = [...container.querySelectorAll('span.rounded-full')].map(el => (el as HTMLElement).style.background);
    const rgb = (hex: string) => `rgb(${[1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`;
    expect(dots).toEqual([30, 60, 90].map(g => rgb(NIGHT_SERVICE_TIER_COLORS.default[g as 30 | 60 | 90])));
  });
});
