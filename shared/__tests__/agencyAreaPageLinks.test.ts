import { describe, expect, it } from 'vitest';
import { bandMapHref } from '../agencyPages';

describe('bandMapHref', () => {
  const base = '/?agencies=ttc&lat=43.7&lon=-79.4&z=10';
  const read = (href: string) => Object.fromEntries(new URL(href, 'http://x').searchParams);

  it('adds the band\'s filter with Weekday and Midday and keeps the map framing', () => {
    expect(read(bandMapHref(base, 0)!)).toEqual({ agencies: 'ttc', lat: '43.7', lon: '-79.4', z: '10', h: '10', p: 'midday', day: 'Weekday' });
    expect([1, 2, 3, 4].map(b => read(bandMapHref(base, b)!).h)).toEqual(['15', '20', '30', '60']);
  });

  it('works on an area link, and "all" means no speed filter', () => {
    expect(read(bandMapHref('/?area=toronto', 'all')!)).toEqual({ area: 'toronto', h: 'all', p: 'midday', day: 'Weekday' });
  });

  it('has no link for "less often than 60" or "no midday"', () => {
    expect(bandMapHref(base, 5)).toBeNull();
    expect(bandMapHref(base, 6)).toBeNull();
  });
});

describe('bandMapLinkLabel', () => {
  it('says "or better", since the map filter includes the faster routes', async () => {
    const { bandMapLinkLabel } = await import('../agencyPages');
    expect([0, 1, 2, 3, 4].map(bandMapLinkLabel)).toEqual([10, 15, 20, 30, 60].map(n => `Show routes every ${n} min or better on the map`));
    expect(bandMapLinkLabel(5)).toBeNull();
    expect(bandMapLinkLabel(6)).toBeNull();
  });
});
