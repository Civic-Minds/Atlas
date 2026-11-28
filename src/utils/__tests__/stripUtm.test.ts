import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { withoutUtm } from '../stripUtm';

// CIV-3192: links from MCP answers carry utm tags; the address bar drops them after load and keeps everything else.
describe('withoutUtm', () => {
  it('drops every utm_ tag and keeps the map state', () => {
    expect(withoutUtm('?route=ttc%3A%3A504&day=Weekday&utm_source=mcp&utm_medium=claude')).toBe('?route=ttc%3A%3A504&day=Weekday');
    expect(withoutUtm('?utm_source=mcp&utm_medium=chatgpt')).toBe('');
    expect(withoutUtm('?day=Saturday')).toBe('?day=Saturday');
  });
  it('runs on every page load', () => {
    expect(readFileSync('src/main.tsx', 'utf8')).toMatch(/\nstripUtmAfterLoad\(\);/);
  });
});
