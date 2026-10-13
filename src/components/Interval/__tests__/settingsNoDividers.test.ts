import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Settings sections are separated by spacing only. Dividers were removed and
// re-added several times because each new section header was copy-pasted with
// a border-t. Keep this guard so that stops happening.
describe('Settings panel', () => {
  it('has no divider borders between sections', () => {
    const src = readFileSync(resolve(__dirname, '../FilterPanel.tsx'), 'utf8');
    const settings = src.slice(src.indexOf('{/* Appearance'));
    expect(settings.length).toBeGreaterThan(0);
    expect(settings).not.toMatch(/border-t|border-b|divide-y|<hr/);
  });
});
