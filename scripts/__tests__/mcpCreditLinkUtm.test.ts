import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CREDIT_NOTE, creditMarkdown, mcpClientFrom, withMapLinkTags } from '../mcp/toolHelpers';
import { SITE_URL } from '../../shared/rules/paths';

// CIV-3192: credits are markdown links on the licence's name (never a bare address), and every Atlas link in an MCP
// answer carries utm_source=mcp and utm_medium=<the assistant>.
describe('MCP credit links (CIV-3192)', () => {
  it('links the licence name inside the required words, word for word', () => {
    const words = 'Contains public sector Data made available under the City of Hamilton’s Open Data Licence';
    const md = creditMarkdown({ label: words, href: 'https://example.org/l', linkText: 'City of Hamilton’s Open Data Licence' });
    expect(md).toBe('Contains public sector Data made available under the [City of Hamilton’s Open Data Licence](https://example.org/l)');
    expect(md.replace(/\[|\]\([^)]*\)/g, '')).toBe(words);
  });
  it('links the whole line when the name is not in it, and never leaves a bare address', () => {
    expect(creditMarkdown({ label: 'Their own words.', href: 'https://x.org', linkText: 'Not here' })).toBe('[Their own words.](https://x.org)');
    expect(creditMarkdown({ label: 'Data provided by 511.org', href: 'https://511.org/' })).not.toMatch(/\(https?:\/\/[^)]*\)$(?<!\]\(https?:\/\/[^)]*\))/);
    expect(CREDIT_NOTE).toMatch(/markdown link/);
  });
  it('no credit is written as words followed by a bare address in brackets', () => {
    const src = readFileSync('scripts/mcp/toolHelpers.ts', 'utf8');
    expect(src).not.toMatch(/\$\{c\.label\} \(\$\{c\.href\}\)/);
  });
});

describe('MCP map links are tagged (CIV-3192)', () => {
  it('reads the assistant from clientInfo, plain mcp when it is unknown', () => {
    expect(mcpClientFrom('claude-ai')).toBe('claude');
    expect(mcpClientFrom('Anthropic/ClaudeAI')).toBe('claude');
    expect(mcpClientFrom('openai-mcp')).toBe('chatgpt');
    expect(mcpClientFrom('ChatGPT')).toBe('chatgpt');
    expect(mcpClientFrom('cursor')).toBe('mcp');
    expect(mcpClientFrom(undefined)).toBe('mcp');
  });
  it('adds utm_source=mcp and utm_medium to every Atlas link at any depth, and leaves other links alone', () => {
    const out = withMapLinkTags({ mapLink: `${SITE_URL}/?route=ttc%3A%3A504&day=Weekday`, rows: [{ link: `${SITE_URL}/agency/ttc` }], licence: 'https://open.toronto.ca/x' }, 'claude') as {
      mapLink: string; rows: { link: string }[]; licence: string;
    };
    const u = new URL(out.mapLink);
    expect(u.searchParams.get('utm_source')).toBe('mcp');
    expect(u.searchParams.get('utm_medium')).toBe('claude');
    expect(u.searchParams.get('route')).toBe('ttc::504');
    expect(new URL(out.rows[0].link).searchParams.get('utm_medium')).toBe('claude');
    expect(out.licence).toBe('https://open.toronto.ca/x');
  });
  it('both servers tag every tool answer', () => {
    for (const f of ['workers/atlas-mcp/src/index.ts', 'scripts/mcp/atlas-mcp.ts']) expect(readFileSync(f, 'utf8'), f).toMatch(/withMapLinkTags\(await handler\(a\), client\)/);
  });
});
