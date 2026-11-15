import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  HISTORY_AGENCY_SEARCH_PLACEHOLDER, PART_TIME_ROUTES_SEARCH, SEARCH_AGENCIES_PLACEHOLDER, SEARCH_ANY_PLACEHOLDER,
  SEARCH_FEEDS_PLACEHOLDER, SEARCH_HIDDEN_ROUTES_PLACEHOLDER, SEARCH_NIGHT_PLACEHOLDER, SEARCH_ROUTES_PLACEHOLDER,
  SEARCH_SHORT_PLACEHOLDER, SEARCH_VEHICLES_PLACEHOLDER, searchPlaceholder,
} from '../noticeCopy';
import { historyRouteSearchPlaceholder } from '../../utils/historyOpen';

// CIV-1569 part 7: search box hints start with "Find" (Ryan, 2026-11-14), from one searchPlaceholder.
describe('search box hints (CIV-1569)', () => {
  it('"Find " + what the box finds + "…"', () => {
    expect(searchPlaceholder('routes')).toBe('Find routes…');
    expect(searchPlaceholder()).toBe('Find…');
    expect(SEARCH_ROUTES_PLACEHOLDER).toBe('Find routes…');
    expect(SEARCH_NIGHT_PLACEHOLDER).toBe('Find agencies or routes…');
    expect(SEARCH_VEHICLES_PLACEHOLDER).toBe('Find vehicles…');
    expect(SEARCH_AGENCIES_PLACEHOLDER).toBe('Find agencies…');
    expect(SEARCH_HIDDEN_ROUTES_PLACEHOLDER).toBe('Find hidden routes…');
    expect(SEARCH_FEEDS_PLACEHOLDER).toBe('Find feeds…');
    expect(PART_TIME_ROUTES_SEARCH).toBe('Find part-time routes…');
    expect(SEARCH_ANY_PLACEHOLDER).toBe('Find…');
    expect(SEARCH_SHORT_PLACEHOLDER).toBe('Find');
    expect(HISTORY_AGENCY_SEARCH_PLACEHOLDER).toBe('Find an agency…');
    expect(historyRouteSearchPlaceholder('MARTA')).toBe('Find a MARTA route…');
  });
});

const ROOT = resolve(__dirname, '../../..');
function files(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : files(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}
const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\w])\/\/.*$/gm, '$1');

describe('no search hint typed in place (CIV-1569)', () => {
  const sources = ['src', 'shared'].flatMap(d => files(join(ROOT, d))).map(f => ({ name: relative(ROOT, f), text: code(readFileSync(f, 'utf8')) }));

  it('no text placeholder="…" and no "Search …" / "Find …" hint string outside noticeCopy', () => {
    // The report form's text box is not a search box; the top bar's input shows its hint in a span and has an empty placeholder.
    const allowedPlaceholders = ['Describe what you saw and what you expected.', ''];
    const hits = sources.filter(s => s.name !== 'src/content/noticeCopy.ts').flatMap(s => s.text.split('\n')
      .filter(line => {
        const literal = /placeholder=["']([^"']*)["']/.exec(line);
        return (literal && !allowedPlaceholders.includes(literal[1])) || /['"`>](Search|Find)( [^'"`<]*)?…/.test(line);
      })
      .map(line => `${s.name}: ${line.trim()}`));
    expect(hits).toEqual([]);
  });
});
