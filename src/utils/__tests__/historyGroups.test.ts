import { describe, expect, it } from 'vitest';
import { groupHistoryAgencies } from '../historyGroups';

const snap = (year: number, h: number, refDate: string): { year: number; label: string; weekdayHeadwayMin: number; v2: { refDate: string }; memberSlug?: string } => ({ year, label: String(year), weekdayHeadwayMin: h, v2: { refDate } });
const agency = (slug: string, routes: Array<{ routeShortName: string; snapshots: ReturnType<typeof snap>[] }>) => ({ slug, name: slug, region: 'New York', routes: routes.map(r => ({ ...r, routeName: r.routeShortName, memberSlug: undefined as string | undefined })) });
const PARENT: Record<string, string> = { 'nyct-bus-queens': 'mta-new-york', 'mta-bus-company': 'mta-new-york' };

describe('History groups a parent agency (CIV-1963)', () => {
  const out = groupHistoryAgencies([
    agency('nyct-bus-queens', [{ routeShortName: 'Q10', snapshots: [snap(2004, 12, '20040915')] }, { routeShortName: 'Q44', snapshots: [snap(2020, 8, '20200915')] }]),
    agency('mta-bus-company', [{ routeShortName: 'Q10', snapshots: [snap(2004, 15, '20040901'), snap(2010, 10, '20100915')] }]),
    agency('ttc', [{ routeShortName: '29', snapshots: [snap(2020, 10, '20200915')] }]),
  ], slug => PARENT[slug]);

  it('lists MTA New York once, under the parent name, with every feed', () => {
    expect(out.map(e => [e.agency.slug, e.agency.name, e.members])).toEqual([
      ['mta-new-york', 'MTA New York', ['nyct-bus-queens', 'mta-bus-company']],
      ['ttc', 'ttc', ['ttc']],
    ]);
  });

  it('keeps a route in two feeds as one row, the later reading winning a shared year, each snapshot naming its feed', () => {
    const q10 = out[0].agency.routes.find(r => r.routeShortName === 'Q10')!;
    expect(q10.snapshots.map(s => [s.year, s.weekdayHeadwayMin, s.memberSlug])).toEqual([[2004, 12, 'nyct-bus-queens'], [2010, 10, 'mta-bus-company']]);
    expect(q10.memberSlug).toBe('mta-bus-company');
    expect(out[0].agency.routes.map(r => r.routeShortName)).toEqual(['Q10', 'Q44']);
  });
});
