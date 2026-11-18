import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LIVE_GLOSSARY } from '../../../../shared/liveGlossary';
import { bunchingLine, colourLine, deliveredLine, extraWaitLine, lateLine, networkFiguresLine, positionsLine, recordingGapsLine, runTimeLine, stopsLine, tripMatchLine } from '../methodLines';

const text = (node: unknown) => {
  const el = document.createElement('div');
  el.innerHTML = renderToStaticMarkup(<>{node}</>);
  return (el.textContent ?? '').trim();
};

const ROOT = resolve(__dirname, '../../../..');
function files(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' || name === 'node_modules' ? [] : files(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}
/** Where a Live term's words may be written: the glossary, and the Live label files it reads. */
const HOMES = new Set(['shared/liveGlossary.ts', 'shared/liveWording.ts', 'shared/liveDashboard.ts']);

/** The Docs glossary and the Live agency page's "How this is measured" read from one home (shared/liveGlossary). */
describe('Live glossary', () => {
  const lines: Record<string, unknown> = {
    Late: lateLine, 'Trip time': runTimeLine(), 'Extra wait': extraWaitLine, Bunching: bunchingLine(), Delivered: deliveredLine(),
    'Vehicle positions': positionsLine, 'Trip matching': tripMatchLine(), 'Agency figures': networkFiguresLine, Stops: stopsLine, 'Recording gaps': recordingGapsLine,
    'Coloured changes': colourLine,
  };
  for (const { term, text: def } of LIVE_GLOSSARY.filter(g => !g.legend)) {
    it(`${term} reads the same on the agency page and in the glossary`, () => {
      // The bold term, then the rest of the sentence, no colon (CIV-1075).
      expect(text(lines[term])).toBe(`${term} ${def}`);
    });
  }
  it('shows the delay legend in its own words (E22)', () => {
    const legend = LIVE_GLOSSARY.find(g => g.legend);
    expect(`${legend?.term}: ${legend?.text}`).toBe('Typical delay: 1.5 min or more ahead · On time · 1–5.5 min behind · More than 5½ min late');
  });
  it('types each definition only in its home, never again in a page', () => {
    // The opening words of each definition; a second copy anywhere in src or shared fails (rules audit 2.9).
    const openings = LIVE_GLOSSARY.filter(g => !g.legend).map(g => g.text.slice(0, 30));
    const copies = [...files(join(ROOT, 'src')), ...files(join(ROOT, 'shared'))]
      .map(f => relative(ROOT, f))
      .filter(f => !HOMES.has(f))
      .flatMap(f => { const src = readFileSync(join(ROOT, f), 'utf8'); return openings.filter(o => src.includes(o)).map(o => `${f}: ${o}`); });
    expect(copies).toEqual([]);
  });
});
