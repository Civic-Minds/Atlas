import { describe, expect, it } from 'vitest';
import { figure, rankRoutes } from '../overviewListModel';

const row = (route: string, lateShare: number | null) => ({ route, lateShare } as any);

describe('overviewListModel (CIV-991)', () => {
  it('ranks routes worst first by the measure, routes with no figure last, ties by route number', () => {
    const s = { routes: [row('10', 0.2), row('2', null), row('9', 0.4), row('3', 0.2)] } as any;
    expect(rankRoutes(s, new Map(), 'late').map(x => x.r.route)).toEqual(['9', '3', '10', '2']);
  });
  it("gives a route's late share as a percent, and nothing when it has none", () => {
    expect(figure(row('1', 0.236), undefined, 'late')).toEqual({ value: 0.236, text: '24%' });
    expect(figure(row('1', null), undefined, 'late')).toBeNull();
  });
});
