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
  // CIV-957: an empty list's sentence as a quoted string or bare JSX text ("No feeds match…", "No … in view.").
  { name: 'empty list text written inline', pattern: /['"`]No [a-z][^'"`\n]*\b(match|in view|recorded)[^'"`\n]*\.['"`]|>\s*No [a-z][^<{\n]*\b(match|in view|recorded)[^<{\n]*\.\s*</ },
  { name: 'loading text written inline', pattern: /['"`>]\s*Loading[^'"`<\n]*(…|\.\.\.)\s*['"`<]/ },
];

// Live is Atlas Live's own app and lane; its texts move here when that work is scheduled. The Diagnostics pages are
// internal tools, not rider-facing.
const ALLOWED = [/^Diagnostics[A-Za-z]*\.tsx$/, /^apps\/LiveVehicles\.tsx$/, /^Live[A-Za-z]*\.tsx$/, /^components\/Live\//, /^components\/LiveOffNotice\.tsx$/, /^components\/Interval\/panels\/LiveStopArrivals\.tsx$/];

describe('notice text lives in noticeCopy.ts', () => {
  for (const rule of RULES) {
    it(`no ${rule.name} outside src/content`, () => {
      const offenders = files(SRC)
        .map(f => relative(SRC, f))
        .filter(f => !f.startsWith('content/') && !ALLOWED.some(a => a.test(f)))
        // Comments may quote a text ("the ring beside \"Loading...\""); only code counts.
        .filter(f => rule.pattern.test(readFileSync(join(SRC, f), 'utf8').replace(/\/\*[\s\S]*?\*\/|^\s*\/\/.*$/gm, '')));
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
      "{list.length === 0 ? 'No hidden routes match your search.' : null}",
      '<div className="py-24">Loading…</div>',
    ];
    RULES.forEach((rule, i) => expect(rule.pattern.test(samples[i])).toBe(true));
  });
});

// CIV-1045: every Learn more opens the explainer its notice is paired with (NOTICE_EXPLAINERS), never a panel named inline.
describe('Learn more notices name their explainer', () => {
  const sources = files(SRC).map(f => [relative(SRC, f), readFileSync(f, 'utf8')] as const).filter(([f]) => !f.startsWith('content/'));

  it('no help panel is named inline', () => {
    expect(sources.filter(([, src]) => /helpTopic:\s*['"`]/.test(src)).map(([f]) => f)).toEqual([]);
  });

  it('every code a component pairs is in the map, and every mapped panel exists', async () => {
    const { NOTICE_EXPLAINERS, EXPLAINERS } = await import('../noticeCopy');
    const used = sources.flatMap(([, src]) => [...src.matchAll(/explainerFor\(([^)]*)\)/g)].flatMap(m => [...m[1].matchAll(/'(N\d+)'/g)].map(c => c[1])));
    expect(used.length).toBeGreaterThan(0);
    for (const code of used) expect(Object.keys(NOTICE_EXPLAINERS)).toContain(code);
    for (const topic of Object.values(NOTICE_EXPLAINERS)) expect(Object.keys(EXPLAINERS)).toContain(topic);
  });

  it('every opening of a help panel goes through explainerFor', () => {
    const opens = sources.flatMap(([f, src]) => [...src.matchAll(/helpTopic:\s*([^,}\n]+)/g)].map(m => [f, m[1].trim()] as const))
      .filter(([f]) => !/InfoPanel\.tsx$|App\.tsx$/.test(f));
    expect(opens.length).toBeGreaterThan(0);
    for (const [, value] of opens) expect(value).toMatch(/^explainerFor\(/);
  });
});
