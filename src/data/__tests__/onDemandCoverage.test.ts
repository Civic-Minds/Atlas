import { describe, expect, it } from 'vitest';
import { ON_DEMAND_NOT_MAPPED, ON_DEMAND_PARTLY_MAPPED, onDemandCoverageNote } from '../onDemandCoverage';
import * as Services from '../onDemandServiceAreas';

// Every slug with a drawn zone, standalone agencies included (App.tsx attaches the rest).
const MAPPED_SLUGS = [
  'all-points-transit', 'bay-transit', 'columbia-area-transit', 'ctran', 'cobourg', 'cyride',
  'durango-transit', 'edmonton', 'gltc', 'goraleigh', 'grt', 'hamilton', 'islandtransit',
  'metro-transit', 'mountainline', 'mvta', 'rfta', 'sam', 'snoqualmie-valley', 'tillamook', 'uta',
  'valley-metro-roanoke',
  Services.BWG_ON_DEMAND_AGENCY.slug,
  Services.CALEDON_ON_DEMAND_AGENCY.slug,
  Services.BRAMPTON_ON_DEMAND_AGENCY.slug,
  Services.MUSKOKA_DRT_ON_DEMAND_AGENCY.slug,
  Services.ST_ALBERT_ON_DEMAND_AGENCY.slug,
  Services.LEAMINGTON_LT_GO_ON_DEMAND_AGENCY.slug,
  Services.WINKLER_ON_DEMAND_AGENCY.slug,
];

describe('on-demand coverage notes (CIV-23)', () => {
  it('never lists a mapped agency as "not mapped yet"', () => {
    for (const slug of MAPPED_SLUGS) expect(ON_DEMAND_NOT_MAPPED[slug], slug).toBeUndefined();
  });

  it('only marks mapped agencies as partly mapped', () => {
    for (const slug of Object.keys(ON_DEMAND_PARTLY_MAPPED)) expect(MAPPED_SLUGS, slug).toContain(slug);
  });

  it('gives an unmapped agency with on-demand service a note and no zone', () => {
    const [slug, entry] = Object.entries(ON_DEMAND_NOT_MAPPED)[0] ?? ['test-agency', { serviceName: 'Test On-Demand' }];
    const note = onDemandCoverageNote({ slug });
    if (ON_DEMAND_NOT_MAPPED[slug]) expect(note).toEqual({ kind: 'not-mapped', ...entry });
  });

  it('suppresses the "not mapped" note once a zone is attached', () => {
    const slug = Object.keys(ON_DEMAND_NOT_MAPPED)[0];
    if (slug) expect(onDemandCoverageNote({ slug, onDemandServiceArea: {} })).toBeNull();
  });

  it('names the missing part for a partly mapped service', () => {
    expect(onDemandCoverageNote({ slug: 'uta', onDemandServiceArea: {} }, { uta: 'North Utah County' })).toEqual({ kind: 'partly-mapped', missing: 'North Utah County' });
  });

  it('says nothing for an agency with no on-demand service', () => {
    expect(onDemandCoverageNote({ slug: 'no-such-agency' })).toBeNull();
  });
});
