import { describe, expect, it } from 'vitest';
import { nightSections } from '../NightService';

describe('Night list sections (CIV-1963)', () => {
  it("puts a parent's feeds in one section named for the parent, and leaves other agencies alone", () => {
    const s = nightSections([{ slug: 'nyct-subway', parentAgency: 'mta-new-york' }, { slug: 'nyct-bus-manhattan', parentAgency: 'mta-new-york' }, { slug: 'njt' }]);
    expect(s.get('nyct-bus-manhattan')).toEqual({ slug: 'nyct-subway', name: 'MTA New York' });
    expect(s.get('nyct-subway')).toEqual({ slug: 'nyct-subway', name: 'MTA New York' });
    expect(s.get('njt')).toEqual({ slug: 'njt' });
  });
});
