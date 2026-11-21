import { describe, expect, it } from 'vitest';
import { studioAgencyInView } from '../studioAgency';

const agencies = [
  { slug: 'ttc', bbox: [43.58, -79.64, 43.86, -79.11] as [number, number, number, number] },
  { slug: 'yrt', bbox: [43.75, -79.75, 44.35, -79.0] as [number, number, number, number] },
  { slug: 'hamilton', bbox: [43.1, -80.1, 43.35, -79.6] as [number, number, number, number] },
];
const listed = new Set(['ttc', 'hamilton', 'yrt']);

describe('Studio opens on the agency the map is on', () => {
  it('picks the listed agency whose area holds the map centre, the smallest where areas overlap', () => {
    expect(studioAgencyInView('?lat=43.64&lon=-79.48&z=11', agencies, listed)).toBe('ttc');
    expect(studioAgencyInView('?lat=43.80&lon=-79.40', agencies, listed)).toBe('ttc');
    expect(studioAgencyInView('?lat=43.25&lon=-79.87', agencies, listed)).toBe('hamilton');
  });
  it('gives none with no map centre, outside every area, or for an agency no Studio page lists', () => {
    expect(studioAgencyInView('', agencies, listed)).toBeNull();
    expect(studioAgencyInView('?lat=45.4&lon=-75.7', agencies, listed)).toBeNull();
    expect(studioAgencyInView('?lat=43.64&lon=-79.48', agencies, new Set(['hamilton']))).toBeNull();
  });
});
