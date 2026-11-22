import { describe, expect, it, vi } from 'vitest';

// night_service (CIV-2080): the Night Service page's grades, with each route's Late and Overnight figures.
const fig = (shown: string, waitMinutes: number | null) => ({ period: '', hours: 'h', shown, waitMinutes });
const route = (name: string, night: 30 | 60 | 90 | null | undefined) => ({
  key: name, name, shortName: name, longName: `${name} St`, mode: 'bus', routeIds: [name], span: null, bounds: null, night,
  figures: { late: fig('every 30 min', 30), overnight: fig(night ? `every ${night} min` : 'no service', night ?? null) },
});
let routes: unknown[] = [];
vi.mock('../mcp/atlasData', () => ({ parseDay: () => 'Weekday', routeList: async () => routes }));
vi.mock('../mcp/toolHelpers', () => ({ needAgency: async () => ({ name: 'Test Transit' }), validThrough: () => '2027-01-01', SOURCE: 's' }));

const call = async (args: Record<string, unknown>) => {
  const { nightHandlers } = await import('../mcp/nightTools');
  return nightHandlers.night_service(args) as Promise<Record<string, any>>;
};

describe('night_service', () => {
  it('lists routes at the grade asked or better, strictest first, with their late-night figures', async () => {
    routes = [route('5', 90), route('2', 60), route('1', 30), route('3', null)];
    const r = await call({ agency: 'x' });
    expect(r.routes.map((x: { route: string }) => x.route)).toEqual(['1', '2']);
    expect(r.routes[0].overnight).toEqual({ hours: 'h', shown: 'every 30 min', waitMinutes: 30 });
    expect(r.rule).toBe('Routes with a departure every 60 min or better from 2–5 AM.');
    expect((await call({ agency: 'x', every: 90 })).routes).toHaveLength(3);
  });

  it('refuses a grade the Night Service page does not have', async () => {
    await expect(call({ agency: 'x', every: 45 })).rejects.toThrow(/30, 60, 90/);
  });

  it('says so when the files predate night grades', async () => {
    routes = [route('1', undefined)];
    expect((await call({ agency: 'x' })).note).toMatch(/don't carry night grades yet/);
  });
});
