// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

// #1524: a lazy part rendered by renderToString wrote React's error message, with the build machine's file path, into
// the page. Every prerendered page must come out clean, with the beta-only parts (Live's glossary terms) switched on.
vi.mock('../../shared/config', async importOriginal => {
  const real = await importOriginal<typeof import('../../shared/config')>();
  return { ...real, FEATURES: { ...real.FEATURES, liveReports: true } };
});

describe('prerendered pages carry no render errors (#1524)', () => {
  it('has no React error text or local paths in any page', async () => {
    const { PRERENDER_PATHS, renderPage } = await import('../prerender');
    for (const path of PRERENDER_PATHS) {
      const html = renderPage(path);
      expect(html, path).not.toMatch(/renderToString|Suspense boundary|data-msg|data-stck|\/Users\//);
    }
  });
});
