import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { countOf } from '../../../../shared/overflowText';

const source = readFileSync(resolve(import.meta.dirname, '../SidebarControls.tsx'), 'utf8');

describe('search result headings count with countOf', () => {
  it('reads "1 match", not "1 matches"', () => {
    expect(countOf(1, 'match', 'matches')).toBe('1 match');
    expect(countOf(2, 'match', 'matches')).toBe('2 matches');
  });

  it('builds the Agencies, Routes and Stops headings through countOf', () => {
    expect(source).toContain("`Agencies · ${countOf(agencySearchDisplay.totalMatches, 'match', 'matches')}`");
    expect(source).not.toMatch(/totalMatches\} matches/);
  });
});
