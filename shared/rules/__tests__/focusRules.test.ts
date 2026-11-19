import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LIVE_ARCHIVE_SHARDS } from '../../liveArchiveFeeds';
import { FOCUS_AGENCY_SLUGS, FOCUS_AREAS, PRODUCT_FOCUS, STUDIO_DEFAULT_AGENCY, isFocusAgency } from '../focus';

describe('the focus list (CIV-1866)', () => {
  it('names real agencies once each', () => {
    for (const slug of FOCUS_AGENCY_SLUGS) expect(existsSync(`config/agencies/${slug}.json`), slug).toBe(true);
    expect(new Set(FOCUS_AGENCY_SLUGS).size).toBe(FOCUS_AGENCY_SLUGS.length);
    expect(isFocusAgency('ttc')).toBe(true);
    expect(isFocusAgency('bustang')).toBe(false);
  });

  it('holds every product list inside the focus areas', () => {
    for (const [product, slugs] of Object.entries(PRODUCT_FOCUS)) {
      for (const slug of slugs) expect(isFocusAgency(slug), `${product}: ${slug}`).toBe(true);
    }
  });

  it('records only what Live is meant to record, and opens Studio on a Studio agency', () => {
    const recorded = new Set<string>(LIVE_ARCHIVE_SHARDS.flatMap(s => [...s.positionSlugs, ...s.tripSlugs]));
    for (const slug of PRODUCT_FOCUS.live) expect(recorded.has(slug), slug).toBe(true);
    expect(PRODUCT_FOCUS.studio).toContain(STUDIO_DEFAULT_AGENCY);
  });

  it('matches the strategy page, which names every focus area', () => {
    const strategy = readFileSync('docs/product/STRATEGY.md', 'utf8');
    for (const area of FOCUS_AREAS) expect(strategy, area.name).toContain(area.name.replace(/ \(.*\)$/, ''));
    expect(strategy).toContain('shared/rules/focus.ts');
  });
});
