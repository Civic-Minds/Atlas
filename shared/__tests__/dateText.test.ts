import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { dateRange, longDate, shortDate } from '../dateText';

// CIV-1569 part 5: every date the site shows comes from shared/dateText.ts.
describe('dates (CIV-1569)', () => {
  it('shortDate: "Oct 12, 2026" from an ISO date, a timestamp or yyyymmdd', () => {
    expect(shortDate('2026-10-12')).toBe('Oct 12, 2026');
    expect(shortDate('20261012')).toBe('Oct 12, 2026');
    expect(shortDate('2026-07-07')).toBe('Jul 7, 2026');
    expect(shortDate('2026-11-09T14:00:00Z')).toBe('Nov 9, 2026');
    expect(shortDate(null)).toBeNull();
    expect(shortDate('')).toBeNull();
    expect(shortDate('20261301')).toBeNull();
  });

  it('longDate: the month in full', () => {
    expect(longDate('2026-11-03')).toBe('November 3, 2026');
    expect(longDate('20261011')).toBe('October 11, 2026');
    expect(longDate('nope')).toBeNull();
  });

  it('dateRange: an en dash, the month once when both days share it, no year', () => {
    expect(dateRange('2026-10-08', '2026-10-14')).toBe('Oct 8–14');
    expect(dateRange('2026-09-30', '2026-10-14')).toBe('Sep 30–Oct 14');
    expect(dateRange('2026-10-08', '2026-10-08')).toBe('Oct 8');
  });
});

const ROOT = resolve(__dirname, '../..');
function files(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : files(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}
const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\w])\/\/.*$/gm, '$1');
const MONTH = '(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)';

describe('no hand-typed or hand-built dates (CIV-1569)', () => {
  const sources = ['src', 'shared'].flatMap(d => files(join(ROOT, d))).map(f => ({ name: relative(ROOT, f), text: code(readFileSync(f, 'utf8')) }));

  it('no "Month D, YYYY" typed into the code', () => {
    const typed = new RegExp(`\\b${MONTH} \\d{1,2}, 20\\d\\d\\b`);
    const hits = sources.flatMap(s => s.text.split('\n').filter(l => typed.test(l)).map(l => `${s.name}: ${l.trim()}`));
    expect(hits).toEqual([]);
  });

  it('no date formatted with toLocaleDateString or a month-name list outside dateText.ts', () => {
    const hits = sources.filter(s => s.name !== 'shared/dateText.ts' && /toLocaleDateString|\['Jan', 'Feb'/.test(s.text)).map(s => s.name);
    expect(hits).toEqual([]);
  });
});
