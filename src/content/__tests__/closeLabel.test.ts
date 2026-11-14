import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BACK_PLACES } from '../backLinks';
import { CLEAR_SEARCH_LABEL, CLOSE_PLACES, closeLabel } from '../noticeCopy';

// CIV-1569 part 3: every close X is PanelCloseButton, named by closeLabel(place); every search box's clear X is
// SearchClearButton.
describe('close labels (CIV-1569)', () => {
  it('a close X says "Close " + what it closes; common things lower case, names keep their case', () => {
    expect(closeLabel(CLOSE_PLACES.filters)).toBe('Close filters');
    expect(closeLabel(CLOSE_PLACES.settings)).toBe('Close settings');
    expect(closeLabel(CLOSE_PLACES.chart)).toBe('Close chart');
    expect(closeLabel(CLOSE_PLACES.schedule)).toBe('Close schedule');
    expect(closeLabel(CLOSE_PLACES.reportForm)).toBe('Close report form');
    expect(closeLabel(CLOSE_PLACES.exportDialog)).toBe('Close export dialog');
    expect(closeLabel(CLOSE_PLACES.whatsNew)).toBe('Close what’s new');
    expect(closeLabel(CLOSE_PLACES.privacySettings)).toBe('Close privacy and analytics settings');
    expect(closeLabel(CLOSE_PLACES.aboutAtlas)).toBe('Close About Atlas');
    expect(CLOSE_PLACES.aboutAtlas).toBe(BACK_PLACES.aboutAtlas);
    expect(CLEAR_SEARCH_LABEL).toBe('Clear search');
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

describe('no hand-built close or clear X (CIV-1569)', () => {
  const sources = ['src', 'shared'].flatMap(d => files(join(ROOT, d))).map(f => ({ name: relative(ROOT, f), text: code(readFileSync(f, 'utf8')) }));

  it('only PanelCloseButton and SearchClearButton draw an X icon', () => {
    const allowed = new Set(['src/components/ui/PanelHeader.tsx', 'src/components/ui/SearchClearButton.tsx']);
    const hits = sources.filter(s => !allowed.has(s.name) && /<X\b|\bX as \w+|import \{[^}]*\bX\b[^}]*\} from 'lucide-react'/.test(s.text)).map(s => s.name);
    expect(hits).toEqual([]);
  });

  it('no close or clear name is typed by hand', () => {
    const hits = sources.flatMap(s => s.text.split('\n')
      .filter(line => /(aria-label|closeLabel|label)=["'{`]*['"`]?(Close|Clear search)\b/.test(line))
      .map(line => `${s.name}: ${line.trim()}`));
    expect(hits).toEqual([]);
  });
});
