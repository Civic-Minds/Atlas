import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// #1919: Live has one icon (components/Live/LiveIcon.ts). No file picks its own: the Live icon's lucide name is imported
// nowhere else, and Studio's Live tab uses the shared one.
const files = (dir: string): string[] => readdirSync(dir).flatMap(f => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? (f === '__tests__' ? [] : files(p)) : /\.tsx?$/.test(f) ? [p] : [];
});

describe('Live icon (#1919)', () => {
  it('imports the Live icon from the shared module only', () => {
    const own = files('src').filter(p => !p.endsWith(join('Live', 'LiveIcon.ts')))
      .filter(p => /import\s*\{[^}]*\b(Radio|Activity)\b[^}]*\}\s*from\s*'lucide-react'/.test(readFileSync(p, 'utf8')));
    expect(own).toEqual([]);
  });
  it('is the icon on Studio’s Live tab', () => {
    expect(readFileSync('src/apps/studio/Studio.tsx', 'utf8')).toMatch(/live: LiveIcon\b/);
  });
});
