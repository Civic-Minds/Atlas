import { describe, expect, it } from 'vitest';
import { agencyEntryCount, agencyGroupName, groupAgencies } from './agencyGroups';

const a = (slug: string, parentAgency?: string) => ({ slug, name: slug.toUpperCase(), ...(parentAgency ? { parentAgency } : {}) });

describe('groupAgencies', () => {
  it("collapses a parent's members into one entry at its first member's place", () => {
    const groups = groupAgencies([a('ttc'), a('nyct-subway', 'mta-new-york'), a('mbta'), a('lirr', 'mta-new-york'), a('nyct-bus-queens', 'mta-new-york')]);
    expect(groups.map(g => [g.slug, g.members.map(m => m.slug)])).toEqual([
      ['ttc', ['ttc']], ['mta-new-york', ['nyct-subway', 'lirr', 'nyct-bus-queens']], ['mbta', ['mbta']],
    ]);
    expect(groups.map(g => agencyGroupName(g, x => x.name))).toEqual(['TTC', 'MTA New York', 'MBTA']);
  });
  it('leaves an agency naming an unknown parent as its own entry', () => {
    expect(groupAgencies([a('x', 'not-a-parent')]).map(g => [g.slug, g.parent])).toEqual([['x', undefined]]);
  });
  it('counts a parent once', () => {
    expect(agencyEntryCount([a('exo', 'exo'), a('exo-laurentides', 'exo'), a('stm')])).toBe(2);
  });
});
