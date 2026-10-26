import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { describe, expect, it } from 'vitest';

// One shared Atlas logo (CIV-508, #1058): pale disc with an accent icon, same look at every width.
const SRC = resolve(__dirname, '../..');
const read = (f: string) => readFileSync(resolve(SRC, f), 'utf8');
const LOGO = read('components/AtlasLogo.tsx');
const BRAND = read('components/AtlasBrand.tsx');
const USERS = ['App.tsx', 'DiagnosticsUnevenPage.tsx', 'DiagnosticsPerformancePage.tsx', 'LiveToolPage.tsx', 'components/SiteHeader.tsx', 'components/SiteFooter.tsx'];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? (n === '__tests__' ? [] : walk(p)) : /\.tsx$/.test(n) ? [p] : [];
  });
}

describe('shared Atlas logo component', () => {
  it('uses a pale disc with an accent icon, not a solid accent fill', () => {
    expect(LOGO).toContain('bg-[var(--bg-panel)]');
    expect(LOGO).not.toContain('bg-[var(--accent)]');
    expect(LOGO).toContain('text-[var(--accent)]');
    expect(LOGO).not.toContain('text-white');
  });

  it('has a rounded, light keyboard-only focus ring', () => {
    expect(LOGO).toContain('rounded-full');
    expect(LOGO).toContain('focus-visible:ring-2');
    expect(LOGO).toContain('focus-visible:ring-[var(--accent-border)]');
    expect(LOGO).not.toMatch(/(^|\s)focus:(outline|ring)(?!-none)/);
  });

  it('has no width-based classes that change how the logo looks', () => {
    for (const [name, src] of [['AtlasLogo', LOGO], ['AtlasBrand', BRAND]]) {
      // The phone top bar drops the "by Civic Minds" byline (content, kept on purpose); nothing else may fork.
      const classes = src.replace('hidden sm:block', '');
      expect(classes, `${name} width forks`).not.toMatch(/(^|[\s'"`])(max-sm|sm|md|lg|xl|2xl|min-\[[^\]]*\]|max-\[[^\]]*\]):/);
    }
  });

  for (const file of USERS) {
    it(`${file} imports AtlasLogo`, () => {
      expect(read(file)).toMatch(/import AtlasLogo from '\.\/(components\/)?AtlasLogo'/);
    });
  }

  it('no other file draws its own logo disc or imports the bare wordmark', () => {
    for (const p of walk(SRC)) {
      if (/components\/(AtlasLogo|AtlasBrand)\.tsx$/.test(p)) continue;
      const src = readFileSync(p, 'utf8');
      expect(src, p).not.toMatch(/import AtlasBrand/);
      expect(src, p).not.toMatch(/<MapIcon[^>]*accent/);
    }
  });
});
