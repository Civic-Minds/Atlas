import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Every notice, empty-state and error text comes from src/content/noticeCopy.ts (CIV-1045, Ryan: "one single page where
// the entire site pulls from"). This fails when one is written inline in a component again: add it to noticeCopy.ts
// and call it from there.
const SRC = resolve(__dirname, '../..');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : files(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

const RULES: Array<{ name: string; pattern: RegExp }> = [
  // Attributes may hold JSX (an action link), so a value in braces may nest one level.
  { name: 'empty state written inline', pattern: /<PanelEmpty\b(?:\s+[\w-]+(?:="[^"]*"|=\{(?:[^{}]|\{[^{}]*\})*\})?)*\s*>\s*[A-Za-z]/ },
  { name: 'notice message written inline', pattern: /\bmessage="[^"]/ },
  { name: 'empty page text written inline', pattern: /<EmptyPage\b[^>]*\b(title|body)="/ },
  { name: 'map notice written inline', pattern: /<MapNoticePill\b[^>]*>\s*[A-Za-z]/ },
  { name: 'map hint written inline', pattern: /showMapHint\(\s*['"`]/ },
  { name: 'error label written inline', pattern: /<ErrorBoundary\b[^>]*\blabel="/ },
  { name: 'card notice written inline', pattern: /className=\{`?\$?\{?CARD_NOTICE\b[^>]*>\s*[A-Za-z]/ },
];

// Live is Atlas Live's own app and lane; its texts move here when that work is scheduled.
const ALLOWED = [/^apps\/LiveVehicles\.tsx$/, /^Live[A-Za-z]*\.tsx$/, /^components\/Live\//, /^components\/LiveOffNotice\.tsx$/, /^components\/Interval\/panels\/LiveStopArrivals\.tsx$/];

describe('notice text lives in noticeCopy.ts', () => {
  for (const rule of RULES) {
    it(`no ${rule.name} outside src/content`, () => {
      const offenders = files(SRC)
        .map(f => relative(SRC, f))
        .filter(f => !f.startsWith('content/') && !ALLOWED.some(a => a.test(f)))
        .filter(f => rule.pattern.test(readFileSync(join(SRC, f), 'utf8')));
      expect(offenders).toEqual([]);
    });
  }

  it('each rule catches the copy it is for', () => {
    const samples = [
      '<PanelEmpty kind="error" action={<ArrowLink onClick={close}>Close</ArrowLink>}>No matches found.</PanelEmpty>',
      '<CardHelpNotice message="We corrected this data." />',
      '<EmptyPage title="No page for this agency" />',
      '<MapNoticePill className="px-3">\n  On-demand areas couldn\'t load.',
      "showMapHint('Location URL copied')",
      '<ErrorBoundary label="The map encountered an error.">',
      '<p className={CARD_NOTICE}>Biggest changes first</p>',
    ];
    RULES.forEach((rule, i) => expect(rule.pattern.test(samples[i])).toBe(true));
  });
});
