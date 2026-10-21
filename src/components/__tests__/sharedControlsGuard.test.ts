import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * CIV-395: shared controls are drawn by their shared component or style constant only. A hand-built
 * copy of one of these class strings (or a one-off control inside History) fails here, so History and
 * the regular lists can't drift apart again (#1013, #1014, #1015).
 */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

const FILES = sourceFiles('src').map(path => ({ path, src: readFileSync(path, 'utf8') }));

/** Class strings that belong to one shared component or constant, and the only file allowed to hold them. */
const OWNED: { what: string; pattern: RegExp; owner: string }[] = [
  { what: 'round icon button', pattern: /w-7 h-7 flex items-center justify-center rounded-full/, owner: 'src/components/ui/RoundIconButton.tsx' },
  { what: 'card header block', pattern: /shrink-0 px-4 pt-4 pb-3 border-b/, owner: 'src/components/Interval/cardUi.tsx' },
  { what: 'card summary line', pattern: /text-xs font-bold text-\[var\(--text-dim\)\] mt-1 leading-snug/, owner: 'src/components/Interval/cardUi.tsx' },
  { what: 'agency list region heading', pattern: /px-5 pt-3 pb-1 text-xs font-bold/, owner: 'src/styles.ts' },
  { what: 'agency list filter block', pattern: /shrink-0 px-4 pt-3 pb-2 bg-\[var\(--bg-panel\)\] border-b/, owner: 'src/styles.ts' },
  { what: 'one-off search field', pattern: /rounded-lg bg-\[var\(--bg-btn\)\] border border-\[var\(--border-primary\)\]/, owner: 'src/styles.ts' },
];

describe('shared controls have one owner (CIV-395)', () => {
  for (const { what, pattern, owner } of OWNED) {
    it(`the ${what} is only built in ${owner}`, () => {
      const copies = FILES.filter(f => f.path !== owner && pattern.test(f.src)).map(f => f.path);
      expect(copies).toEqual([]);
    });
  }

  it('History builds no list controls of its own', () => {
    const history = FILES.find(f => f.path === 'src/apps/History.tsx')!.src;
    // Lists, rows, back links, search and round buttons come from the shared components.
    // Its only input is the year slider; a text field means a search of its own (the top bar searches).
    expect(history).not.toMatch(/placeholder=/);
    expect(history).not.toMatch(/ChevronLeft|ChevronRight/);
    expect(history).not.toMatch(/SEARCH_PILL|SEARCH_FIELD/);
    expect(history).not.toMatch(/<button\b[^>]*rounded-full/);
    expect(history).not.toMatch(/variant="agency"/);
  });
});
