import { describe, expect, it } from 'vitest';
import { liveStudioAgencies, liveStudioMinDays, parseSegmentsFileName } from '../liveStudioAgencies';

describe("Studio's Live agencies (CIV-1828)", () => {
  it('reads an agency and route from an analysis file name, nothing else', () => {
    expect(parseSegmentsFileName('kingston-12-segments.json')).toEqual({ slug: 'kingston', route: '12' });
    expect(parseSegmentsFileName('go-transit-21-segments.json')).toEqual({ slug: 'go-transit', route: '21' });
    expect(parseSegmentsFileName('ttc-504-segments.before.json')).toBeNull();
    expect(parseSegmentsFileName('ttc-agency.json')).toBeNull();
    expect(parseSegmentsFileName('../x-1-segments.json')).toBeNull();
  });

  it('lists an agency once a route that is not held covers the minimum days, TTC first', () => {
    const files = [
      { slug: 'kingston', route: '1', days: 2, held: false },
      { slug: 'ttc', route: '504', days: 17, held: false },
      { slug: 'ttc', route: '512', days: 17, held: true },
      { slug: 'hamilton', route: '1', days: 9, held: true },
      { slug: 'barrie', route: '8', days: 3, held: false },
    ];
    expect(liveStudioAgencies(files, 3)).toEqual(['ttc', 'barrie']);
    expect(liveStudioAgencies(files, 2)).toEqual(['ttc', 'barrie', 'kingston']);
    expect(liveStudioAgencies(files, 7)).toEqual(['ttc']);
  });

  it('uses 7 days for Studio and the shortest section minimum on the dev server', () => {
    expect([liveStudioMinDays(false), liveStudioMinDays(true)]).toEqual([7, 3]);
  });
});
