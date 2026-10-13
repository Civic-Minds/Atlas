import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { agencyPageData, resolveAgencySeo } from './agencyPages';
import { agencyPageSummaries } from './agencyPagesData';
import { buildAgencyIndexData, resolveAgencyIndexSeo } from './agencyIndex';
import { buildAreaPageData, resolveAreaSeo } from './areaPages';
import type { AreaConfig } from './areas';
import { DESCRIPTION_MAX, truncateAtWord } from './seoText';

const agencies = agencyPageSummaries();
const areas = readdirSync('config/areas').filter(f => f.endsWith('.json') && !f.startsWith('_'))
  .map(f => JSON.parse(readFileSync(`config/areas/${f}`, 'utf8')) as AreaConfig).filter(a => a.page);

describe('search result copy fits', () => {
  it('every agency page title is 60 characters or fewer and every description 160 or fewer', () => {
    expect(agencies.length).toBeGreaterThan(100);
    for (const a of agencies) {
      const seo = resolveAgencySeo(a, { mode: 'public', intro: agencyPageData(a, agencies, null).intro });
      expect(seo.title.length, `${a.slug} title: ${seo.title}`).toBeLessThanOrEqual(60);
      expect(seo.description.length, `${a.slug} description: ${seo.description}`).toBeLessThanOrEqual(160);
      expect(seo.description.length, `${a.slug} description is too short: ${seo.description}`).toBeGreaterThanOrEqual(40);
      expect(seo.title, a.slug).not.toMatch(/frequent routes/i);
    }
  });

  it('every area page title is 60 characters or fewer and every description 160 or fewer', () => {
    const bySlug = new Map(agencies.map(a => [a.slug, a]));
    let checked = 0;
    for (const area of areas) {
      const data = buildAreaPageData(area, bySlug, null);
      if (data.agencies.length === 0) continue;
      const seo = resolveAreaSeo(data, { mode: 'public' });
      expect(seo.title.length, `${area.slug} title: ${seo.title}`).toBeLessThanOrEqual(60);
      expect(seo.description.length, `${area.slug} description: ${seo.description}`).toBeLessThanOrEqual(160);
      checked++;
    }
    expect(checked).toBeGreaterThan(20);
  });

  it('the agency index title and description fit', () => {
    const seo = resolveAgencyIndexSeo(buildAgencyIndexData(agencies, areas, null), { mode: 'public' });
    expect(seo.title.length).toBeLessThanOrEqual(60);
    expect(seo.description.length).toBeLessThanOrEqual(160);
  });

  it('long descriptions are cut at a word boundary', () => {
    const cut = truncateAtWord('Toronto Transit Commission operates 231 routes in Toronto with 7,566 stops and connects with YRT, GO Transit', 60);
    expect(cut.length).toBeLessThanOrEqual(60);
    expect(cut).toBe('Toronto Transit Commission operates 231 routes in Toronto');
    expect(DESCRIPTION_MAX).toBeLessThanOrEqual(160);
  });
});
