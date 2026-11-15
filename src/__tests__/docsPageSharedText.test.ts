import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as copy from '../content/noticeCopy';

/**
 * CIV-1610 (Ryan): the Docs page takes its wording from the app's shared text, so it can't drift from what the app says.
 * Any shared text (a notice, a filter's label or definition, the page's name) typed into the page by hand fails here;
 * the page must read the constant instead.
 */
const source = readFileSync(new URL('../AboutDocsPage.tsx', import.meta.url), 'utf8');

function sharedTexts(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (value && typeof value === 'object') Object.values(value).forEach(v => sharedTexts(v, out));
  return out;
}

// Long enough to be a real phrase, not a common word that happens to match.
const texts = [...new Set(sharedTexts(Object.values(copy)))].filter(text => text.length >= 18 && !text.includes('${'));

describe('the Docs page reads shared text', () => {
  it('has no shared text typed by hand', () => {
    expect(texts.length).toBeGreaterThan(50);
    expect(texts.filter(text => source.includes(text))).toEqual([]);
  });

  it('names itself from the shared constants', () => {
    expect(source).not.toMatch(/>Documentation<|title: 'Documentation'/);
  });
});
