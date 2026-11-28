import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// CIV-3208: compare_agencies with vs_day gives each agency the second day's count in the same answer, counted as a second call would.
const fx = JSON.parse(readFileSync(join(import.meta.dirname, '../../src/utils/__tests__/fixtures/ttc-29-weekday.json'), 'utf8')) as { features: Array<{ properties: Record<string, unknown> }> };
const features = fx.features.map(f => ({ ...f, geometry: { type: 'LineString', coordinates: [[0, 0], [0, 1]] } }));

async function handlers() {
  const data = await import('../mcp/atlasData');
  const { memoryStore } = await import('../../shared/mcpMemoryStore');
  data.useStore(memoryStore({ catalog: [{ slug: 'fixture', name: 'Fixture Transit', region: 'Ontario', lastFeedExpiry: '20271231' }] as never, meta: { fixture: { shortName: 'FX', parentAgency: null } }, files: { fixture: features as never } }));
  return (await import('../mcp/tools')).handlers;
}
type Row = { routesOnDay: number; routesRunningInPeriod: number; routesMeeting: number; vs?: { routesOnDay: number; routesRunningInPeriod: number; routesMeeting: number; change: number } };

describe('compare_agencies vs_day (CIV-3208)', () => {
  it('matches a second call on the vs day and part of the day, with the change', async () => {
    const h = await handlers();
    const both = await h.compare_agencies({ agencies: ['Fixture Transit'], period: 'AM peak', every: 30, vs_day: 'Sunday', vs_period: 'Evening' }) as { vs: { day: string; period: string }; agencies: Row[] };
    const first = (await h.compare_agencies({ agencies: ['Fixture Transit'], period: 'AM peak', every: 30 }) as { agencies: Row[] }).agencies[0];
    const second = (await h.compare_agencies({ agencies: ['Fixture Transit'], period: 'Evening', every: 30, day: 'Sunday' }) as { agencies: Row[] }).agencies[0];
    expect(both.vs.day).toBe('Sunday');
    expect(both.vs.period).toMatch(/^Evening/);
    const row = both.agencies[0];
    expect([row.routesOnDay, row.routesRunningInPeriod, row.routesMeeting]).toEqual([first.routesOnDay, first.routesRunningInPeriod, first.routesMeeting]);
    expect(row.vs).toEqual({ routesOnDay: second.routesOnDay, routesRunningInPeriod: second.routesRunningInPeriod, routesMeeting: second.routesMeeting, change: second.routesMeeting - first.routesMeeting });
    expect(first.routesMeeting).toBeGreaterThan(0);
  });
  it('compares the same part of the day when vs_period is left out, and adds nothing without vs_day', async () => {
    const h = await handlers();
    const same = await h.compare_agencies({ agencies: ['Fixture Transit'], period: 'Midday', every: 30, vs_day: 'Saturday' }) as { vs: { period: string } };
    expect(same.vs.period).toMatch(/^Midday/);
    const plain = await h.compare_agencies({ agencies: ['Fixture Transit'], period: 'Midday', every: 30 }) as { agencies: Row[] };
    expect(plain).not.toHaveProperty('vs');
    expect(plain.agencies[0]).not.toHaveProperty('vs');
  });
});
