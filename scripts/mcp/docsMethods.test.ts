import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

// CIV-3197: explain_method's text is the Docs page's own, as the public site builds it.
describe('explain_method text', () => {
  it('matches the Docs page', async () => {
    vi.stubEnv('VITE_ATLAS_MODE', 'public');
    vi.stubEnv('DEV', false);
    vi.resetModules();
    const { docsMethodsFile } = await import('./docsMethodsRender');
    const out = docsMethodsFile();
    const file = new URL('./docsMethods.generated.ts', import.meta.url);
    if (process.env.ATLAS_WRITE_DOCS_METHODS === '1') writeFileSync(file, out);
    expect(readFileSync(file, 'utf8'), 'Docs page changed: rerun with ATLAS_WRITE_DOCS_METHODS=1').toBe(out);
    vi.unstubAllEnvs();
  });
});

describe('explain_method', () => {
  it('answers every topic with the Docs text and a Docs link, and is listed', async () => {
    const { docsHandlers } = await import('./docsTools');
    const { DOCS_METHOD_TOPICS } = await import('./docsMethodTopics');
    const { TOOLS } = await import('./toolDefs');
    for (const t of DOCS_METHOD_TOPICS) {
      const res = docsHandlers.explain_method({ topic: t.key }) as { text: string; docsLink: string };
      expect(res.text.length, t.key).toBeGreaterThan(100);
      expect(res.docsLink).toMatch(/\/about\/docs#/);
    }
    expect(() => docsHandlers.explain_method({ topic: 'nope' })).toThrow(/Topics:/);
    expect(TOOLS.some(t => t.name === 'explain_method')).toBe(true);
  });
});
