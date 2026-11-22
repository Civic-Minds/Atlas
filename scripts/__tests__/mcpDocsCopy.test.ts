import { describe, expect, it } from 'vitest';
import { MCP_DOCS } from '../../shared/mcpDocsCopy';
import { TOOLS } from '../mcp/toolDefs';

// Ryan, 2026-11-22: "isn't this false now". The docs page must not deny current figures while route_now gives them.
describe('MCP docs page copy', () => {
  it('does not say the MCP has no current figures while route_now exists', () => {
    expect(TOOLS.some(t => t.name === 'route_now')).toBe(true);
    const text = JSON.stringify(MCP_DOCS).toLowerCase();
    for (const claim of ['past service only', 'never the current hour', 'no figures for how a route is running right now']) expect(text).not.toContain(claim);
    expect(text).toContain('last half hour');
  });
});

// Ryan, 2026-11-22: "in the table of contents the headings should be 1 word".
describe('MCP docs page contents menu', () => {
  it('names every section in one word', () => {
    for (const label of Object.values(MCP_DOCS.contents)) expect(label).toMatch(/^\S+$/);
  });
});
