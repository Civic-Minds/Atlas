import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// CIV-3184 (Ryan, "1"): two boundaries that keep the repo's parts apart.
const tracked = (dir: string) => execSync(`git ls-files ${dir}`, { encoding: 'utf8' }).split('\n').filter(f => /\.(ts|tsx|mjs|js)$/.test(f));
const isTest = (f: string) => /__tests__\/|\.test\.|\.spec\./.test(f);

/**
 * The pipeline files that read the app's src/ on purpose (CIV-3189, manager's pick 3, 2026-11-28): both read a route the way the
 * route card does (routeReading, effectiveHeadway), so the pipeline's figures and the card's always match. Moving that reading engine
 * into shared/ would take src/content/noticeCopy.ts with it, which keeps its settled home. Never add to this list.
 */
const PIPELINE_READS_SRC: Record<string, string> = {
  'pipeline/feedCompare.ts': "src/utils/routeReading and the ShapeProperties type: Studio's comparison reads each route as its card does",
  'pipeline/historyV2.ts': "src/utils/effectiveHeadway and the ShapeProperties and TimePeriod types: History's low end is the route list's own",
};

describe('layer boundaries (CIV-3184)', () => {
  it('pipeline/ never imports from src/ (tests may, to check the app reads what the pipeline writes)', () => {
    const fromSrc = /(?:from\s+|import\s*\()\s*['"](?:\.\.\/)+src\//;
    const hits = tracked('pipeline').filter(f => !isTest(f) && !(f in PIPELINE_READS_SRC))
      .flatMap(f => readFileSync(f, 'utf8').split('\n').map((line, i) => ({ f, n: i + 1, line })))
      .filter(({ line }) => fromSrc.test(line))
      .map(({ f, n, line }) => `${f}:${n}: ${line.trim()}`);
    expect(hits).toEqual([]);
  });

  it('the allowlisted pipeline files still need their exception (remove the entry once the import is gone)', () => {
    for (const f of Object.keys(PIPELINE_READS_SRC)) expect(readFileSync(f, 'utf8'), f).toMatch(/['"](?:\.\.\/)+src\//);
  });

  it('no Studio code reaches the production build: every way in is a dev-only lazy import', () => {
    // Studio (src/apps/studio/) and its coverage page are dev-only (FEATURE_FLAGS.md): the app may reach them only through
    // `import.meta.env.DEV ? React.lazy(() => import(...)) : …`, which Vite drops from the production bundle.
    const entry = /['"][^'"]*(?:apps\/studio\/|\/StudioCoveragePage)['"]/;
    const outside = tracked('src').filter(f => !isTest(f) && !f.startsWith('src/apps/studio/') && f !== 'src/pages/StudioCoveragePage.tsx');
    const bad = outside.flatMap(f => readFileSync(f, 'utf8').split('\n').map((line, i) => ({ f, n: i + 1, line })))
      .filter(({ line }) => entry.test(line))
      .filter(({ line }) => !/import\.meta\.env\.DEV\s*\?\s*React\.lazy\(\s*\(\)\s*=>\s*import\(/.test(line))
      .map(({ f, n, line }) => `${f}:${n}: ${line.trim()}`);
    expect(bad).toEqual([]);
  });
});
