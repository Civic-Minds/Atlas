import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LIVE_GLOSSARY } from '../../../../shared/liveGlossary';
import { bunchingLine, colourLine, deliveredLine, delaysStartLine, extraWaitLine, lateLine, networkFiguresLine, positionsLine, recordingGapsLine, runTimeLine, stopsLine, tripMatchLine } from '../methodLines';

const text = (node: unknown) => renderToStaticMarkup(<>{node}</>).replace(/<[^>]+>/g, '').replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, '&').trim();

/** The Docs glossary must say the same as the Live agency page's "How this is measured". */
describe('Live glossary', () => {
  const lines: Record<string, unknown> = {
    Late: lateLine, 'Run time': runTimeLine(), 'Extra wait': extraWaitLine, Bunching: bunchingLine(), Delivered: deliveredLine(),
    'Where delays start': delaysStartLine, 'Vehicle positions': positionsLine, 'Trip matching': tripMatchLine(), 'Network figures': networkFiguresLine, Stops: stopsLine, 'Recording gaps': recordingGapsLine,
  };
  for (const { term, text: def } of LIVE_GLOSSARY) {
    it(`${term} reads the same on the agency page and in the glossary`, () => {
      expect(text(term === 'How changes are coloured' ? colourLine : lines[term])).toBe(term === 'How changes are coloured' ? def : `${term}: ${def}`);
    });
  }
});
