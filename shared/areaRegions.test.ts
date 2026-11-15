import { describe, expect, it } from 'vitest';
import { areaShortName, areaSubtitleName } from './areaRegions';

describe('areaShortName', () => {
  const short = (slug: string, name: string) => areaShortName({ slug, name });
  it('drops a trailing area, metro area or region word', () => {
    expect(short('ann-arbor', 'Ann Arbor')).toBe('Ann Arbor');
    expect(short('chicago', 'Chicago')).toBe('Chicago');
    expect(short('portland-or-wa', 'Portland')).toBe('Portland');
    expect(short('washington', 'Washington')).toBe('Washington, D.C.');
    expect(short('kiryas-joel', 'Kiryas Joel')).toBe('Mid-Hudson');
  });
  it('keeps names that are proper names on their own', () => {
    expect(short('toronto', 'Toronto')).toBe('Greater Toronto and Hamilton Area');
    expect(short('san-francisco', 'San Francisco')).toBe('Bay Area');
    expect(short('kitchener', 'Kitchener')).toBe('Waterloo Region');
    expect(short('boston', 'Boston')).toBe('Greater Boston');
    expect(short('bremerton', 'Bremerton')).toBe('Kitsap County');
  });
});

describe('areaSubtitleName (CIV-1614)', () => {
  const name = (slug: string, n: string) => areaSubtitleName({ slug, name: n });
  it('drops a lowercase trailing area: "Calgary, Alberta"', () => {
    expect(name('calgary', 'Calgary')).toBe('Calgary');
    expect(name('new-york', 'New York')).toBe('New York');
    expect(name('portland-or-wa', 'Portland')).toBe('Portland');
  });
  it('keeps a name that is itself an Area, or has no trailing area', () => {
    expect(name('toronto', 'Toronto')).toBe('Greater Toronto and Hamilton Area');
    expect(name('san-francisco', 'San Francisco')).toBe('Bay Area');
    expect(name('vancouver', 'Vancouver')).toBe('Metro Vancouver');
    expect(name('kiryas-joel', 'Kiryas Joel')).toBe('Mid-Hudson region');
  });
});
