import { describe, expect, it } from 'vitest';
import * as data from '../mcp/atlasData';
import { agencyNamesIn, withFeedCredits, withScheduleWarning } from '../mcp/toolHelpers';
import { slimCatalog } from '../mcp/splitBuild';
import type { AtlasStore, McpAgency } from '../../shared/mcpStore';

// #1694: answers for agencies read through the 511 API carry "Data provided by 511.org" with its link (shared/feedCredits.ts).
const catalog: McpAgency[] = [
  { slug: 'sfmta', name: 'San Francisco Municipal Transportation Agency (SFMTA - Muni)', feedCredit: '511' },
  { slug: 'ttc', name: 'Toronto Transit Commission' },
];
const store = { catalog: async () => catalog, available: async () => new Set(['sfmta', 'ttc']), meta: async () => new Map() } as unknown as AtlasStore;

describe('feed publisher credits in MCP answers', () => {
  it('adds the 511 credit and link to an answer about a 511 agency', async () => {
    data.useStore(store);
    const out = await withFeedCredits({ agency: catalog[0].name, route: 'N' }) as Record<string, string>;
    expect(out.credit).toBe('Data provided by 511.org (https://511.org/)');
    expect(out.creditNote).toMatch(/at the end of the answer/);
  });
  it('finds the agency in compare rows and list rows, and leaves other answers alone', async () => {
    data.useStore(store);
    expect(agencyNamesIn({ agencies: [{ agency: 'Toronto Transit Commission' }, { agency: catalog[0].name }] })).toContain(catalog[0].name);
    expect(await withFeedCredits({ agencies: [`${catalog[0].name} | California | 2026-11-01 | 2027-01-01`] })).toHaveProperty('credit');
    expect(await withFeedCredits({ agency: 'Toronto Transit Commission' })).not.toHaveProperty('credit');
    const wrapped = withScheduleWarning({ t: async () => ({ agency: catalog[0].name }) });
    expect(await wrapped.t({})).toHaveProperty('credit');
  });
  it('keeps the credit key in the hosted catalog', () => {
    expect(slimCatalog(catalog)[0].feedCredit).toBe('511');
  });
});
