import { describe, expect, it } from 'vitest';
import { TOOLS, TOOL_SUMMARIES } from './toolDefs';

// CIV-1900: every tool has one plain line for people (the internal MCP docs page reads it), in the site's words.
describe('tool summaries', () => {
  it('gives every tool one, and only tools', () => {
    for (const t of TOOLS) expect(TOOL_SUMMARIES[t.name], t.name).toBeTruthy();
    expect(Object.keys(TOOL_SUMMARIES).sort()).toEqual(TOOLS.map(t => t.name).sort());
  });

  it('writes one plain sentence: "min", no field names', () => {
    for (const [name, line] of Object.entries(TOOL_SUMMARIES)) {
      expect(line, name).toMatch(/^[A-Z][^.]*\.$/);
      expect(line, name).not.toMatch(/\bminutes?\b/);
      expect(line, name).not.toMatch(/\b[a-z]+_[a-z_]+\b|\b[a-z]+[A-Z]\w*\b/);
    }
  });
});
