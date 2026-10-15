import { describe, expect, it } from 'vitest';
import { allRoutesMapHref } from '../agencyPages';

describe('allRoutesMapHref', () => {
  const read = (href: string) => Object.fromEntries(new URL(href, 'http://x').searchParams);

  it('keeps an agency\'s map framing and adds Weekday, Midday and no speed filter', () => {
    expect(read(allRoutesMapHref('/?agencies=ttc&lat=43.7&lon=-79.4&z=10'))).toEqual({ agencies: 'ttc', lat: '43.7', lon: '-79.4', z: '10', h: 'all', p: 'midday', day: 'Weekday' });
  });

  it('works on an area link', () => {
    expect(read(allRoutesMapHref('/?area=toronto'))).toEqual({ area: 'toronto', h: 'all', p: 'midday', day: 'Weekday' });
  });
});
