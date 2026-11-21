import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * CIV-2003 (Ryan: "Well then we need to refactor" / "Ideally, heavily"): Studio builds its panels, cards, lists, tables,
 * chips, headings and empty lines from the main app's shared pieces, never its own markup. The copy detector only sees
 * ten identical lines in a row, so a small hand-built copy fails here instead. Each exception names its reason.
 */
const ROOT = join(import.meta.dirname, '..', '..', '..', '..');
const walk = (dir: string): string[] => readdirSync(dir).flatMap(n => {
  const p = join(dir, n);
  if (statSync(p).isDirectory()) return n === '__tests__' ? [] : walk(p);
  return /\.tsx?$/.test(n) ? [relative(ROOT, p)] : [];
});
const FILES = [...walk(join(ROOT, 'src/apps/studio')), 'src/StudioCoveragePage.tsx'];

const RULES: { name: string; pattern: RegExp; use: string }[] = [
  // A scroll area in markup; a chip's dropdown size (ChipMenu's panelClassName) is the shared menu's own.
  { name: 'own scroll area', pattern: /className=["{`][^>]*(custom-scrollbar|overflow-y-auto)/, use: 'PanelBody' },
  { name: 'own list markup', pattern: /<(ul|ol|li)\b/, use: 'RouteListRow / CardRouteList / FigureNotes' },
  { name: 'own heading', pattern: /<h[1-6]\b/, use: 'PanelTitleBar / CardSectionLabel / AgencyGroupHeader / FiguresCard title' },
  { name: 'own table', pattern: /<table\b/, use: 'DataTable' },
  { name: 'own grid columns', pattern: /grid-cols-\[/, use: 'RouteListColumns' },
  { name: 'own text line', pattern: /<p className="[^"]*text-\[var\(--text-/, use: 'CardBodyText / PanelEmpty' },
  { name: 'own option button', pattern: /<button\b/, use: 'ChipMenu / ListRow / Pill' },
];

/** File -> rules it may still break, with why. Each entry is a debt with an owner, not a pattern to copy. */
const ALLOWED: Record<string, { rules: string[]; why: string }> = {
  'src/apps/studio/Fleet.tsx': { rules: ['own scroll area', 'own text line'], why: "the Buses Needed panel, UX's rebuild (CIV-2002)" },
  'src/apps/studio/StudioGroupFigures.tsx': { rules: ['own text line'], why: "the Buses Needed panel's figures, UX's rebuild (CIV-2002)" },
};

describe('Studio builds on the shared pieces (CIV-2003)', () => {
  it('has no hand-built panels, lists, headings, tables or text lines outside the listed exceptions', () => {
    const found = FILES.flatMap(f => {
      const text = readFileSync(join(ROOT, f), 'utf8');
      return RULES.filter(r => r.pattern.test(text) && !ALLOWED[f]?.rules.includes(r.name)).map(r => `${f}: ${r.name} (use ${r.use})`);
    });
    expect(found).toEqual([]);
  });
  it('keeps no exception that is no longer needed', () => {
    const stale = Object.entries(ALLOWED).flatMap(([f, { rules }]) => {
      const text = readFileSync(join(ROOT, f), 'utf8');
      return rules.filter(name => !RULES.find(r => r.name === name)!.pattern.test(text)).map(name => `${f}: ${name}`);
    });
    expect(stale).toEqual([]);
  });
});
