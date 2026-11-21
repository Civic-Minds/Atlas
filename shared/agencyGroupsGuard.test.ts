/**
 * Guard (CIV-1963): one entry per agency or region, everywhere. Every screen and tool that lists, counts, ranks or
 * compares agencies groups them with shared/agencyGroups.ts, never its own copy. A new list of agencies joins SITES.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');

/** The lists, counts, rankings and comparisons of agencies. Each must read shared/agencyGroups. */
const SITES = [
  'shared/agencyIndex.ts', // /agencies list and its count
  'shared/agencyPages.ts', // area and state membership (withParents), nearby agencies
  'shared/coverageRows.ts', // Studio Coverage
  'shared/areaSearch.ts', // map search: an area's agency count
  'src/components/Interval/FilterChips.tsx', // map agency picker
  'src/utils/agencySearch.ts', // map search: agencies
  'src/utils/mapContext.ts', // In view list and the map's count pills
  'src/utils/nightRoutesInView.ts', // Night pill counts
  'src/apps/Interval.tsx', // Frequent pill counts
  'src/utils/chooserRoutes.ts', // route chooser's agency name
  'src/utils/mapExportDetails.ts', // export credit "Schedules from N agencies"
  'src/components/InfoPanel.tsx', // agency browser
  'scripts/mcp/tools.ts', // list_agencies, rank_agencies, compare_agencies
  'scripts/mcp/atlasData.ts', // list_agencies near, compare's parent lookup
  'src/apps/NightService.tsx', // Night list sections
  'src/apps/History.tsx', // History agency list and the open agency
  'src/utils/historyGroups.ts', // History's merge of a parent's feeds
  'src/DiagnosticsPerformancePage.tsx', // diagnostics agency count
];

/** Page modules that build a parent's own page from its members (its Services list): allowed to read members directly. */
const PARENT_PAGE_MODULES = new Set(['shared/parentAgencies.ts', 'shared/parentSummary.ts', 'shared/agencyIndex.ts', 'shared/agencyPages.ts', 'shared/regionPages.ts', 'src/agencyPageDevData.ts', 'scripts/prerender-routes.ts']);

/**
 * CIV-1991: pages that read the catalog (useAgencies) and list, filter or count it. Each must group through
 * shared/agencyGroups, or hand the list to a module that does (named here with the reason).
 */
const PAGE_GLOBS = ['src/*Page.tsx', 'src/apps/**/*.tsx'];
const PAGE_EXCEPTIONS: Record<string, string> = {
  'src/StudioCoveragePage.tsx': 'passes the catalog to coverageRows (shared/coverageRows.ts), which groups it',
  'src/DiagnosticsUnevenPage.tsx': 'a per-feed diagnostic: loads each feed\'s own file, lists no agencies',
};

describe('one entry per agency or region (CIV-1963)', () => {
  it.each(SITES)('%s groups agencies through shared/agencyGroups', file => {
    expect(read(file)).toMatch(/from '(\.\.\/)+(shared\/)?agencyGroups(\.js)?'|from '\.\/agencyGroups(\.js)?'/);
  });

  it('no other module groups members by their parent itself', async () => {
    const { globSync } = await import('node:fs');
    const files = globSync(['src/**/*.{ts,tsx}', 'shared/**/*.ts', 'scripts/mcp/**/*.ts'], { cwd: root }).filter(f => !/\.test\.tsx?$/.test(f));
    const offenders = files.filter(f => !PARENT_PAGE_MODULES.has(f) && f !== 'shared/agencyGroups.ts'
      && /parentsWithMembers\(|parentMembers\(|\.parentAgency\s*===|groups\.find\([^)]*\.name\s*===/.test(read(f)));
    expect(offenders).toEqual([]);
  });

  it('every page that lists the catalog groups it (CIV-1991)', async () => {
    const { globSync } = await import('node:fs');
    const pages = globSync(PAGE_GLOBS, { cwd: root }).filter(f => !/\.test\.tsx?$/.test(f));
    const lists = pages.filter(f => { const src = read(f); return /useAgencies\(\)/.test(src) && /\bagencies\.(map|filter|forEach|length|reduce|flatMap)\b/.test(src); });
    const offenders = lists.filter(f => !PAGE_EXCEPTIONS[f] && !/agencyGroups/.test(read(f)));
    expect(offenders).toEqual([]);
    // An exception that no longer lists the catalog should be dropped.
    expect(Object.keys(PAGE_EXCEPTIONS).filter(f => !lists.includes(f))).toEqual([]);
  });
});
