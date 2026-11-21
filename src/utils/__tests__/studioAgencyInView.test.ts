import { describe, expect, it } from 'vitest';
import { studioAgencyInView } from '../studioAgency';

type Box = [number, number, number, number];
// The catalog's own areas and centres (coarse boxes around each centre), 2026-11-21.
const agencies = [
  { slug: 'guelph', bbox: [43.14, -80.75, 43.94, -79.75] as Box, center: [43.5316, -80.2427] as [number, number] },
  { slug: 'hamilton', bbox: [42.86, -80.37, 43.66, -79.37] as Box, center: [43.2557, -79.8711] as [number, number] },
  { slug: 'ttc', bbox: [43.25, -79.88, 44.05, -78.88] as Box, center: [43.7187, -79.4077] as [number, number] },
  { slug: 'yrt', bbox: [43.48, -79.94, 44.28, -78.94] as Box, center: [43.8828, -79.4403] as [number, number] },
  { slug: 'kingston', bbox: [43.83, -76.99, 44.63, -75.99] as Box, center: [44.2312, -76.486] as [number, number] },
];
const listed = new Set(['guelph', 'hamilton', 'ttc', 'yrt', 'kingston']);

describe('Studio opens on the agency the map is on (#1660)', () => {
  it('opens Hamilton for a map on Hamilton, though Guelph\'s box holds that centre too', () => {
    expect(studioAgencyInView('?lat=43.237&lon=-79.824&z=12.03', agencies, listed)).toBe('hamilton');
  });
  it('opens TTC for a map on Toronto, not YRT', () => {
    expect(studioAgencyInView('?lat=43.64&lon=-79.48&z=11', agencies, listed)).toBe('ttc');
  });
  it('opens Guelph for a map on Guelph', () => {
    expect(studioAgencyInView('?lat=43.5316&lon=-80.2427&z=12', agencies, listed)).toBe('guelph');
  });
  it('gives none with no map centre, outside every area, or for an agency no Studio page lists', () => {
    expect(studioAgencyInView('', agencies, listed)).toBeNull();
    expect(studioAgencyInView('?lat=45.4&lon=-75.7', agencies, listed)).toBeNull();
    expect(studioAgencyInView('?lat=43.237&lon=-79.824', agencies, new Set(['kingston']))).toBeNull();
  });
});
