import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LIVE_GLOSSARY } from '../../../../shared/liveGlossary';
import { bunchingLine, colourLine, deliveredLine, extraWaitLine, lateLine, networkFiguresLine, positionsLine, recordingGapsLine, runTimeLine, stopsLine, tripMatchLine } from '../methodLines';

const text = (node: unknown) => {
  const el = document.createElement('div');
  el.innerHTML = renderToStaticMarkup(<>{node}</>);
  return (el.textContent ?? '').trim();
};

/** The Docs glossary must say the same as the Live agency page's "How this is measured". */
describe('Live glossary', () => {
  const lines: Record<string, unknown> = {
    Late: lateLine, 'Run time': runTimeLine(), 'Extra wait': extraWaitLine, Bunching: bunchingLine(), Delivered: deliveredLine(),
    'Vehicle positions': positionsLine, 'Trip matching': tripMatchLine(), 'Network figures': networkFiguresLine, Stops: stopsLine, 'Recording gaps': recordingGapsLine,
    'Coloured changes': colourLine,
  };
  for (const { term, text: def } of LIVE_GLOSSARY) {
    it(`${term} reads the same on the agency page and in the glossary`, () => {
      // The bold term, then the rest of the sentence, no colon (CIV-1075).
      expect(text(lines[term])).toBe(`${term} ${def}`);
    });
  }
});
