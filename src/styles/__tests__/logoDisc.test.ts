import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// The Atlas home logo disc must never use a solid accent fill (docs/STYLE.md: no dark fills).
// It uses the same pale panel fill with an accent-coloured icon at every width (#1058).
const FILES = ['../../App.tsx', '../../DiagnosticsUnevenPage.tsx', '../../DiagnosticsPerformancePage.tsx'];

function logoDisc(file: string): { disc: string; icon: string } {
  const src = readFileSync(resolve(__dirname, file), 'utf8');
  const at = src.indexOf('<MapIcon');
  expect(at, `${file} has a MapIcon logo`).toBeGreaterThan(-1);
  const discStart = src.lastIndexOf('className="', at);
  const disc = src.slice(discStart, src.indexOf('>', discStart));
  const icon = src.slice(at, src.indexOf('/>', at));
  return { disc, icon };
}

describe('Atlas home logo disc', () => {
  for (const file of FILES) {
    it(`${file.split('/').pop()} keeps a pale disc with an accent icon at every width`, () => {
      const { disc, icon } = logoDisc(file);
      expect(disc).not.toContain('bg-[var(--accent)]');
      expect(disc).toContain('bg-[var(--bg-panel)]');
      expect(disc).not.toMatch(/max-sm:bg-/);
      expect(icon).toContain('text-[var(--accent)]');
      expect(icon).not.toContain('text-white');
    });
  }
});
