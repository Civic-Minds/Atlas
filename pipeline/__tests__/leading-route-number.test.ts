import { describe, expect, it } from 'vitest';
import { splitLeadingRouteNumber } from '../transforms/leading-route-number';

const route = (route_long_name: string, route_short_name = '') => ({ route_id: route_long_name, route_short_name, route_long_name, route_type: '3' }) as any;

describe('route number from the long name (CIV-1551, Manchester NH)', () => {
  it('takes the leading number as the short name and keeps the rest as the long name', () => {
    const { gtfs, split } = splitLeadingRouteNumber({ routes: [route('1 Dartmouth/VA Hospital'), route('2S Hanover St/East Side Plaza SAT'), route('41 Green DASH')] } as any);
    expect(gtfs.routes.map((r: any) => [r.route_short_name, r.route_long_name])).toEqual([
      ['1', 'Dartmouth/VA Hospital'], ['2S', 'Hanover St/East Side Plaza SAT'], ['41', 'Green DASH'],
    ]);
    expect(split).toBe(3);
  });

  it('legitimate: leaves a route with a short name, or a long name not starting with a number, as published', () => {
    const { gtfs, split } = splitLeadingRouteNumber({ routes: [route('1 Main St', '1'), route('Green DASH'), route('2026 Shuttle'), route('101st Street Loop')] } as any);
    expect(gtfs.routes.map((r: any) => [r.route_short_name, r.route_long_name])).toEqual([
      ['1', '1 Main St'], ['', 'Green DASH'], ['2026', 'Shuttle'], ['', '101st Street Loop'],
    ]);
    expect(split).toBe(1);
  });
});
