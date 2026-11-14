import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import DeliveredSection from '../DeliveredSection';
import type { LiveV3 } from '../../../../../shared/liveDashboard';

// #1472 regression: the daily chart rounded 99.96% up to 100% while the tile beside it said 99.9%.
const day = (date: string, share: number) => ({ date, healthy: true, share, seen: 2499, notSeen: 1, unknown: 0, byDirection: {} });
const v3 = { serviceDelivered: { overall: { share: 0.9996, seen: 4998, notSeen: 2, unknown: 0, byDirection: {} }, byDay: [day('2026-10-08', 0.9996), day('2026-10-09', 0.9996)] } } as unknown as LiveV3;

describe('Service delivered (#1472)', () => {
  it('reads each day as the tile does: 99.9%, never rounded up to 100%', () => {
    render(<DeliveredSection v3={v3} dir={null} detail="compact" />);
    expect(screen.getAllByText('99.9%').length).toBeGreaterThanOrEqual(3);
    expect(screen.queryAllByText(/^100(\.0)?%$/).filter(e => e.closest('td'))).toHaveLength(0);
  });
});
