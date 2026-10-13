import { beforeEach, describe, expect, it } from 'vitest';
import { resolveSeo } from '../../../shared/seo';
import { applySeoToDocument } from '../seoDom';

const BETA = { mode: 'beta', flags: { researchApps: true } } as const;
const PUBLIC = { mode: 'public', flags: {} } as const;

describe('applySeoToDocument', () => {
  beforeEach(() => {
    document.head.innerHTML = '<title>old</title>';
    document.title = 'old';
  });

  it('writes title, description, canonical and og:url for a route', () => {
    applySeoToDocument(document, resolveSeo('/about/docs', PUBLIC));
    expect(document.title).toBe('How Transit Atlas works: data, frequency and methods');
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe('https://www.transitatlas.fyi/about/docs');
    expect(document.querySelector('meta[property="og:url"]')?.getAttribute('content')).toBe('https://www.transitatlas.fyi/about/docs');
    expect(document.querySelector('meta[name="description"]')?.getAttribute('content')).toContain('frequency maps');
    expect(document.querySelector('meta[name="robots"]')).toBeNull();
  });

  it('adds noindex on a beta-only route and removes it on leaving', () => {
    applySeoToDocument(document, resolveSeo('/apps/night', BETA));
    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex');
    applySeoToDocument(document, resolveSeo('/about', PUBLIC));
    expect(document.querySelector('meta[name="robots"]')).toBeNull();
    expect(document.querySelectorAll('link[rel="canonical"]')).toHaveLength(1);
  });
});
