import { describe, expect, it } from 'vitest';
import { centreAgencySlugs, viewportAgencySlugs, getAgencyBbox } from '../useAgencyData';
import type { Agency } from '../../App';

// A Toronto-sized service area: bbox is [south, west, north, east].
const toronto = { slug: 'toronto', bbox: [43.5, -79.7, 43.9, -79.1], center: [43.7, -79.4] } as unknown as Agency;
const view = (lat: number, lon: number, half = 0.2) => ({ s: lat - half, n: lat + half, w: lon - half, e: lon + half });

describe('centreAgencySlugs (CIV-1861: the tabs follow the city at the centre)', () => {
  it('names the agency while the centre is inside its area, and nothing once the centre passes the edge', () => {
    const [s, , n, e] = getAgencyBbox(toronto);
    expect(centreAgencySlugs([toronto], view(43.7, -79.4))).toEqual(['toronto']);
    // Just past the east edge: the screen still overlaps the agency's wide area, but its centre has left it.
    const past = view(43.7, e + 0.01);
    expect(viewportAgencySlugs([toronto], past, 10)).toEqual(['toronto']);
    expect(centreAgencySlugs([toronto], past)).toEqual([]);
    expect(centreAgencySlugs([toronto], view(n + 0.01, -79.4))).toEqual([]);
    expect(centreAgencySlugs([toronto], view(s - 0.01, -79.4))).toEqual([]);
  });

  it('reads the same at any zoom (a regional view over the city does not flicker)', () => {
    expect(centreAgencySlugs([toronto], view(43.7, -79.4, 3))).toEqual(['toronto']);
    expect(centreAgencySlugs([toronto], view(43.7, -79.4, 0.05))).toEqual(['toronto']);
  });
});
