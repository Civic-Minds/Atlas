import { describe, expect, it } from 'vitest';
import {
  deriveAgencyBbox,
  bboxesOverlap,
  findBboxOverlaps,
  assertAgencyNotAlreadyPublished,
  assertNoBboxOverlap,
  AgencyAlreadyPublishedError,
  AgencyBboxOverlapError,
} from '../incrementalPmtilesSafety.js';

const PAD = { lat: 0.4, lon: 0.5 };

describe('deriveAgencyBbox', () => {
  it('uses the explicit bbox when present', () => {
    const bbox = deriveAgencyBbox({ slug: 'x', center: [0, 0], bbox: [1, 2, 3, 4] }, PAD);
    expect(bbox).toEqual([1, 2, 3, 4]);
  });

  it('falls back to a center-padded rectangle when no explicit bbox', () => {
    const bbox = deriveAgencyBbox({ slug: 'metz', center: [49.1193, 6.1757] }, PAD);
    expect(bbox).toEqual([49.1193 - 0.4, 6.1757 - 0.5, 49.1193 + 0.4, 6.1757 + 0.5]);
  });
});

describe('bboxesOverlap', () => {
  it('detects overlapping rectangles', () => {
    expect(bboxesOverlap([0, 0, 10, 10], [5, 5, 15, 15])).toBe(true);
  });

  it('detects identical rectangles as overlapping', () => {
    expect(bboxesOverlap([0, 0, 10, 10], [0, 0, 10, 10])).toBe(true);
  });

  it('detects touching-edge rectangles as overlapping (conservative)', () => {
    // North edge of a exactly meets south edge of b — treated as overlap, not a gap.
    expect(bboxesOverlap([0, 0, 10, 10], [10, 0, 20, 10])).toBe(true);
  });

  it('returns false for clearly disjoint rectangles', () => {
    // Metz, France vs. a Newfoundland-area agency — thousands of km apart.
    const metz: [number, number, number, number] = [48.7193, 5.6757, 49.5193, 6.6757];
    const metrobus: [number, number, number, number] = [46.5, -53.5, 48.5, -52.5];
    expect(bboxesOverlap(metz, metrobus)).toBe(false);
  });

  it('returns false when one rectangle is entirely north of the other', () => {
    expect(bboxesOverlap([20, 0, 30, 10], [0, 0, 10, 10])).toBe(false);
  });

  it('returns false when one rectangle is entirely east of the other', () => {
    expect(bboxesOverlap([0, 20, 10, 30], [0, 0, 10, 10])).toBe(false);
  });
});

describe('findBboxOverlaps', () => {
  it('returns an empty list for a geographically isolated agency', () => {
    const agencies = [
      { slug: 'metz', center: [49.1193, 6.1757] as [number, number] },
      { slug: 'ttc', center: [43.65, -79.38] as [number, number] },
      { slug: 'yrt', center: [43.86, -79.44] as [number, number] },
    ];
    expect(findBboxOverlaps('metz', agencies, PAD)).toEqual([]);
  });

  it('flags agencies whose padded bboxes overlap', () => {
    const agencies = [
      { slug: 'ttc', center: [43.65, -79.38] as [number, number] },
      { slug: 'yrt', center: [43.86, -79.44] as [number, number] }, // close to ttc — within fallback pad
    ];
    const overlaps = findBboxOverlaps('ttc', agencies, PAD);
    expect(overlaps.map(o => o.slug)).toEqual(['yrt']);
  });

  it('respects explicit bbox over the center-pad fallback', () => {
    // Centers are far apart but an explicit wide bbox brings them into overlap.
    const agencies = [
      { slug: 'wide', center: [0, 0] as [number, number], bbox: [-10, -10, 10, 10] as [number, number, number, number] },
      { slug: 'far', center: [9, 9] as [number, number] },
    ];
    expect(findBboxOverlaps('wide', agencies, PAD).map(o => o.slug)).toEqual(['far']);
  });

  it('throws if the target slug is not in the agency list', () => {
    expect(() => findBboxOverlaps('missing', [{ slug: 'ttc', center: [43.65, -79.38] }], PAD)).toThrow(
      /not found/,
    );
  });
});

describe('assertAgencyNotAlreadyPublished', () => {
  it('does not throw when the slug is absent from the deployed set', () => {
    expect(() => assertAgencyNotAlreadyPublished('metz', new Set(['ttc', 'yrt']))).not.toThrow();
  });

  it('throws AgencyAlreadyPublishedError when the slug is already deployed', () => {
    expect(() => assertAgencyNotAlreadyPublished('ttc', new Set(['ttc', 'yrt']))).toThrow(
      AgencyAlreadyPublishedError,
    );
  });

  it('error message points the operator at the full rebuild', () => {
    try {
      assertAgencyNotAlreadyPublished('ttc', new Set(['ttc']));
      throw new Error('expected assertAgencyNotAlreadyPublished to throw');
    } catch (e) {
      expect((e as Error).message).toMatch(/npm run build-pmtiles/);
      expect((e as Error).message).toMatch(/out of scope/);
    }
  });
});

describe('assertNoBboxOverlap', () => {
  it('does not throw for a geographically isolated agency', () => {
    const agencies = [
      { slug: 'metz', center: [49.1193, 6.1757] as [number, number] },
      { slug: 'ttc', center: [43.65, -79.38] as [number, number] },
    ];
    expect(() => assertNoBboxOverlap('metz', agencies, PAD)).not.toThrow();
  });

  it('throws AgencyBboxOverlapError when bboxes overlap', () => {
    const agencies = [
      { slug: 'ttc', center: [43.65, -79.38] as [number, number] },
      { slug: 'yrt', center: [43.86, -79.44] as [number, number] },
    ];
    expect(() => assertNoBboxOverlap('ttc', agencies, PAD)).toThrow(AgencyBboxOverlapError);
  });

  it('error message names the overlapping agency and explains drop-densest-as-needed risk', () => {
    const agencies = [
      { slug: 'ttc', center: [43.65, -79.38] as [number, number] },
      { slug: 'yrt', center: [43.86, -79.44] as [number, number] },
    ];
    try {
      assertNoBboxOverlap('ttc', agencies, PAD);
      throw new Error('expected assertNoBboxOverlap to throw');
    } catch (e) {
      expect((e as Error).message).toMatch(/yrt/);
      expect((e as Error).message).toMatch(/drop-densest-as-needed/);
      expect((e as Error).message).toMatch(/npm run build-pmtiles/);
    }
  });
});
