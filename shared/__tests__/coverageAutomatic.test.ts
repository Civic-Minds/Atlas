import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * CIV-1871 (Ryan: "we shouldn't have to keep it updated manually"): the coverage page and its data code read every column
 * from a source (the focus list, History's list, Live's archive and map lists, Studio's files, the MCP's coverage files),
 * so none of them may hold an agency typed by hand.
 */
const FILES = ['src/StudioCoveragePage.tsx', 'shared/coverageRows.ts', 'local-api/mcp-coverage.ts', 'shared/internalPages.ts'];
const SLUGS = readdirSync('config/agencies').filter(f => f.endsWith('.json')).map(f => f.replace(/\.json$/, ''));
// Words an agency slug can also be, used here for something else.
const NOT_AGENCIES = new Set(['go', 'live', 'history', 'studio', 'coverage', 'focus']);

describe('the coverage page reads its columns from their sources (CIV-1871)', () => {
  for (const file of FILES) {
    it(`${file} holds no hand-typed agency slug or list`, () => {
      const code = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\/|^\s*\/\/.*$/gm, '');
      const literals = [...code.matchAll(/(['"`])([a-z][a-z0-9-]*)\1/g)].map(m => m[2]);
      const typed = literals.filter(l => SLUGS.includes(l) && !NOT_AGENCIES.has(l));
      expect(typed).toEqual([]);
    });
  }

  it('reads each column from its shared source', () => {
    const rows = readFileSync('shared/coverageRows.ts', 'utf8');
    for (const source of ['isFocusAgency', 'FOCUS_AGENCY_SLUGS', 'PRODUCT_FOCUS', 'earliestFiguresDay']) expect(rows, source).toContain(source);
    const page = readFileSync('src/StudioCoveragePage.tsx', 'utf8');
    for (const source of ['history-agencies.json', 'LIVE_ARCHIVE_SLUGS', 'LIVE_AGENCY_SLUGS', 'STUDIO_COVERAGE_DEV_URL', 'MCP_COVERAGE_API_URL']) expect(page, source).toContain(source);
    expect(readFileSync('local-api/mcp-coverage.ts', 'utf8')).toContain('PRODUCT_FOCUS.live');
  });

  it('never reads the write keys', () => {
    const code = readFileSync('local-api/mcp-coverage.ts', 'utf8');
    expect(code).not.toMatch(/R2_ACCESS_KEY_ID|R2_SECRET_ACCESS_KEY/);
    // Only these settings are picked out of the main .env.local, and none is copied into process.env.
    expect(code).toContain("MCP_COVERAGE_ENV_KEYS = ['R2_ACCOUNT_ID', 'R2_RO_ACCESS_KEY_ID', 'R2_RO_SECRET_ACCESS_KEY', 'MCP_LIVE_BUCKET']");
    expect(code).not.toMatch(/process\.env\b/);
  });
});
