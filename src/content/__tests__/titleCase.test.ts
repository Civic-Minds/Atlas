import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isTitleCase, titleCase } from '../../../shared/titleCase';
import { PAGE_NAMES, SITE_NAME, TAB_TITLE_MAX, tabTitle } from '../../../shared/pageNames';
import { HOME_TITLE, SEO_ROUTES } from '../../../shared/seo';
import { DOCS_PAGE_TITLE, WHATS_NEW_TITLE } from '../noticeCopy';
import { BACK_PLACES } from '../backLinks';

// Ryan, 2026-11-15 (docs/style/VISUAL.md, "Case"): titles are title case (page and section headings, header and footer
// links, footer column names, browser tabs); everything else stays sentence case. Both halves are checked here.
const ROOT = resolve(__dirname, '../../..');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : files(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

/** A heading written as a sentence (it ends in a full stop or question mark) stays a sentence. */
const sentence = (text: string) => /[.?!”]$/.test(text.trim());

describe('titleCase', () => {
  it('capitalizes words, keeps short joining words lower, and leaves names and units alone', () => {
    expect(titleCase('routes and weekday frequency')).toBe('Routes and Weekday Frequency');
    expect(titleCase('what happens when a check fails')).toBe('What Happens When a Check Fails');
    expect(titleCase('GTFS-Flex and on-demand checks')).toBe('GTFS-Flex and On-Demand Checks');
    expect(titleCase('free up to a set age')).toBe('Free Up to a Set Age');
    expect(titleCase('TTC frequency: how often routes run')).toBe('TTC Frequency: How Often Routes Run');
    expect(titleCase('the Pittsburgh area')).toBe('The Pittsburgh Area');
    expect(titleCase('every 15 min')).toBe('Every 15 min');
    expect(titleCase('what’s new')).toBe('What’s New');
  });
});

describe('titles are title case', () => {
  it('every page name, and the copy constants that carry them', () => {
    for (const name of Object.values(PAGE_NAMES)) expect(isTitleCase(name), name).toBe(true);
    expect(DOCS_PAGE_TITLE).toBe(PAGE_NAMES.docs);
    expect(WHATS_NEW_TITLE).toBe(PAGE_NAMES.whatsNew);
    expect(BACK_PLACES.aboutAtlas).toBe(PAGE_NAMES.aboutPage);
    expect(BACK_PLACES.agencies).toBe(PAGE_NAMES.agencies);
  });

  it('every browser tab: one format, title case, at most 60 characters', () => {
    for (const route of SEO_ROUTES) {
      expect(route.title.length, route.path).toBeLessThanOrEqual(TAB_TITLE_MAX);
      if (sentence(route.title.replace(` ${SITE_NAME}`, ''))) continue; // the story's own headline (Ryan: left as written)
      if (route.title === HOME_TITLE) continue; // only the home page leads with the brand
      expect(route.title.endsWith(` | ${SITE_NAME}`), route.title).toBe(true);
      expect(isTitleCase(route.title), route.title).toBe(true);
    }
    expect(tabTitle('Documentation', 'Data, Frequency and Methods')).toBe('Documentation: Data, Frequency and Methods | Transit Atlas');
    expect(tabTitle('A'.repeat(55))).toBe('A'.repeat(55));
  });

  it('the legal pages: their titles are the page names and their headings title case', () => {
    for (const [file, name] of [['docs/legal/TERMS.md', PAGE_NAMES.terms], ['docs/legal/PRIVACY.md', PAGE_NAMES.privacy]] as const) {
      const text = readFileSync(join(ROOT, file), 'utf8');
      expect(text.split('\n')[0]).toBe(`# ${name}`);
      for (const [, heading] of text.matchAll(/^#{2,3} (.+?)(?: \{#[^}]+\})?$/gm)) expect(isTitleCase(heading), heading).toBe(true);
    }
  });

  it('every heading written in the page code', () => {
    const bad: string[] = [];
    // A story's headlines stay as written (Ryan), as do the bracketed placeholders for his wording.
    for (const path of files(join(ROOT, 'src')).filter(p => !/Story[A-Za-z]*\.tsx$/.test(p))) {
      const text = readFileSync(path, 'utf8');
      for (const [, , heading] of text.matchAll(/<(PageTitle|SectionTitle|SubsectionTitle|h[1-3])\b[^>]*>([^<{]+)</g)) {
        const t = heading.trim();
        if (t && !sentence(t) && !isTitleCase(t)) bad.push(`${relative(ROOT, path)}: ${t}`);
      }
      for (const [, t] of text.matchAll(/<(?:ResearchHeader|Subsection|PageSection)\b[^>]*\btitle="([^"]+)"/g)) {
        if (!sentence(t) && !isTitleCase(t)) bad.push(`${relative(ROOT, path)}: ${t}`);
      }
    }
    expect(bad).toEqual([]);
  });
});

describe('everything else stays sentence case', () => {
  // A capitalized joining word inside a label ("Report A Problem", "Back To Map") is title case leaking into
  // sentence-case text. Page names quoted inside a sentence keep their own case, and have no capitalized joining word.
  const LEAK = /\b[A-Za-z][a-z’']+ (A|An|And|As|At|By|For|In|Of|On|Or|The|To|With) [A-Z][a-z]/;
  it('no title-case joining words in the app’s text', () => {
    expect(LEAK.test('Report A Problem')).toBe(true);
    expect(LEAK.test('Read the Privacy Policy')).toBe(false);
    const bad: string[] = [];
    // src/data holds agencies' own service names ("Calgary Transit On Demand").
    for (const path of [...files(join(ROOT, 'src')), ...files(join(ROOT, 'shared'))].filter(p => !/[\\/]src[\\/]data[\\/]/.test(p))) {
      readFileSync(path, 'utf8').split('\n').forEach((line, i) => {
        if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
        for (const [, s] of line.matchAll(/'([^'\n]{3,})'|"([^"\n]{3,})"|`([^`\n]{3,})`/g)) {
          if (s && LEAK.test(s)) bad.push(`${relative(ROOT, path)}:${i + 1}: ${s}`);
        }
      });
    }
    expect(bad).toEqual([]);
  });
});
