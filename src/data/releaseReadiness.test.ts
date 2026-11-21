import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RELEASES } from './whatsNew';

const root = resolve(__dirname, '../..');
const version: string = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).version;
const changelog = readFileSync(resolve(root, 'CHANGELOG.md'), 'utf8');

type Section = { header: string; version: string | null; date: string | null; lines: string[] };
const sections: Section[] = [];
for (const line of changelog.split('\n')) {
  const h = line.match(/^## \[([^\]]+)\](?: - (\d{4}-\d{2}-\d{2}))?/);
  if (h) sections.push({ header: line, version: h[1] === 'Unreleased' ? null : h[1], date: h[2] ?? null, lines: [] });
  else if (sections.length) sections[sections.length - 1].lines.push(line);
}
const released = sections.filter(s => s.version);
const bulletCount = (s: Section) => s.lines.filter(l => /^- /.test(l)).length;

describe('release readiness', () => {
  it(`has a What's New release entry for package.json's version`, () => {
    expect(
      RELEASES.some(r => r.version === version),
      `Add { version: '${version}', date: '<release date>' } to the top of RELEASES in src/data/whatsNew.ts.`,
    ).toBe(true);
  });

  it('matches the What\'s New date to the CHANGELOG.md header date', () => {
    const unreleasedOnTop = sections[0] && sections[0].version === null;
    if (unreleasedOnTop && released[0]?.version === version) return; // between cuts
    const section = released.find(s => s.version === version);
    expect(section, `Add a "## [${version}] - YYYY-MM-DD" header to CHANGELOG.md (rename [Unreleased] at release).`).toBeDefined();
    const entry = RELEASES.find(r => r.version === version);
    if (!entry) return; // reported by the first check
    expect(
      entry.date,
      `Make the date for ${version} in RELEASES (src/data/whatsNew.ts) equal the CHANGELOG.md header date ${section!.date}.`,
    ).toBe(section!.date);
  });

  it('sorts the newest long changelog section under ### topic headings, none of it above the first heading', () => {
    const long = released.find(s => bulletCount(s) > 15);
    if (!long) return;
    const firstHeading = long.lines.findIndex(l => /^### /.test(l));
    expect(
      firstHeading,
      `Add ### topic subheadings to the ${long.version} section of CHANGELOG.md and sort its bullets under them.`,
    ).toBeGreaterThanOrEqual(0);
    const stray = long.lines.slice(0, firstHeading).filter(l => /^- /.test(l)).length;
    expect(
      stray,
      `Move the ${stray} bullets above the first ### heading in the ${long.version} section of CHANGELOG.md under a topic heading.`,
    ).toBe(0);
  });
});
