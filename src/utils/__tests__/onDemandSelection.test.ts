import { describe, expect, it } from 'vitest';
import { resolveSelectedOnDemandSlug } from '../onDemandSelection';

const area = { type: 'FeatureCollection', features: [] };
const agencies = [
  // HSR-style: fixed routes plus an on-demand area whose name shares the agency's prefix.
  { slug: 'hamilton', onDemandServiceArea: area },
  { slug: 'hamilton-transit-link', onDemandOnly: true, onDemandServiceArea: area },
  { slug: 'ttc' },
];

describe('resolveSelectedOnDemandSlug (#1073)', () => {
  it('selecting an agency that has an on-demand area but fixed routes opens the agency card, not the on-demand card', () => {
    expect(resolveSelectedOnDemandSlug(null, 'hamilton', agencies)).toBeNull();
  });

  it('does not match a similarly named on-demand-only agency by prefix', () => {
    expect(resolveSelectedOnDemandSlug(null, 'hamilton', agencies)).not.toBe('hamilton-transit-link');
  });

  it('selecting an on-demand-only agency still opens its on-demand card', () => {
    expect(resolveSelectedOnDemandSlug(null, 'hamilton-transit-link', agencies)).toBe('hamilton-transit-link');
  });

  it('an explicit on-demand selection wins, with or without a zone, even beside an agency selection', () => {
    expect(resolveSelectedOnDemandSlug('hamilton', null, agencies)).toBe('hamilton');
    expect(resolveSelectedOnDemandSlug('hamilton::zone-1', 'hamilton', agencies)).toBe('hamilton');
  });

  it('plain agencies and no selection resolve to nothing', () => {
    expect(resolveSelectedOnDemandSlug(null, 'ttc', agencies)).toBeNull();
    expect(resolveSelectedOnDemandSlug(null, null, agencies)).toBeNull();
    expect(resolveSelectedOnDemandSlug(null, undefined, agencies)).toBeNull();
  });
});
