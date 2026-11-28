import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { glossarySortKey, sortGlossary } from '../GlossaryTerms';
import { LIVE_GLOSSARY } from '../../../shared/liveGlossary';

// CIV-3191 (Ryan, 2026-11-28: "In Docs glossary should the words be a-z or no", picked 1): one A–Z list, Live's terms sorted in.
const page = readFileSync('src/AboutDocsPage.tsx', 'utf8');
const glossarySection = page.slice(page.indexOf('<Section id="glossary">'), page.indexOf('</Section>', page.indexOf('<Section id="glossary">')));
const coreTerms = [...page.slice(page.indexOf('const DOCS_GLOSSARY'), page.indexOf('\n];', page.indexOf('const DOCS_GLOSSARY'))).matchAll(/term: '((?:[^'\\]|\\.)*)'/g)].map(m => m[1].replace(/\\'/g, "'"));

describe('Docs glossary is one A–Z list (CIV-3191)', () => {
  it('the page shows its terms only through the sorted list, with Live\'s merged in', () => {
    expect(coreTerms.length).toBeGreaterThan(10);
    expect(glossarySection).not.toMatch(/<p><strong/);
    expect(glossarySection).toMatch(/<GlossaryTerms entries=\{sortGlossary\(DOCS_GLOSSARY\)\} \/>/);
    expect(glossarySection).toMatch(/<LiveGlossaryTerms core=\{DOCS_GLOSSARY\} \/>/);
    expect(readFileSync('src/components/LiveGlossaryTerms.tsx', 'utf8')).toMatch(/sortGlossary\(\[\.\.\.core, \.\.\.liveGlossaryEntries\(\)\]\)/);
  });

  it('sorts every term A to Z, quotes and case ignored ("“Every N min”" under E)', () => {
    const all = sortGlossary([...coreTerms, ...LIVE_GLOSSARY.map(g => g.term)].map(term => ({ term })));
    const keys = all.map(e => glossarySortKey(e.term));
    expect(keys).toEqual([...keys].sort((a, b) => a.localeCompare(b, 'en')));
    const every = all.findIndex(e => e.term === '“Every N min”');
    expect(glossarySortKey(all[every - 1].term) <= 'every').toBe(true);
    expect(new Set(all.map(e => e.term)).size).toBe(all.length);
  });
});
