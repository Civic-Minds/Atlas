import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as copy from '../noticeCopy';
import { EXPLAINER_LAYOUT, EXPLAINER_PIECES, EXPLAINERS } from '../noticeCopy';

const source = readFileSync(new URL('../noticeCopy.ts', import.meta.url), 'utf8');
const pieces = Object.entries(EXPLAINER_PIECES);

// CIV-1061: an explainer's paragraphs 2 and 3 are shared pieces, each sentence written once.
describe('explainer pieces', () => {
  it('each piece sentence is written once in noticeCopy.ts', () => {
    for (const [name, piece] of pieces) {
      expect(source.split(piece.text).length - 1, name).toBe(1);
    }
  });

  it('no other text holds its own copy of a piece sentence', () => {
    const others = Object.entries(copy)
      .filter(([name]) => name !== 'EXPLAINER_PIECES')
      .flatMap(([name, value]) => typeof value === 'string' ? [[name, value] as const]
        : value && typeof value === 'object' ? Object.values(value).filter((v): v is string => typeof v === 'string').map(v => [name, v] as const)
        : []);
    for (const [name, text] of others) {
      for (const [pieceName, piece] of pieces) expect(text.includes(piece.text), `${name} copies ${pieceName}`).toBe(false);
    }
  });

  it('codes are unique and permanent-style (X1, X2…)', () => {
    const codes = pieces.map(([, p]) => p.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const code of codes) expect(code).toMatch(/^X\d+$/);
  });

  it('every explainer has a layout, and every piece is used', () => {
    for (const topic of Object.keys(EXPLAINERS)) expect(EXPLAINER_LAYOUT, topic).toHaveProperty(topic);
    const used = new Set(Object.values(EXPLAINER_LAYOUT).flatMap(l => [...l.p2, ...(l.p3 ? [l.p3] : [])]));
    for (const [name] of pieces) expect(used.has(name as keyof typeof EXPLAINER_PIECES), name).toBe(true);
  });

  it('only paragraph-3 pieces carry links', () => {
    const p2 = new Set(Object.values(EXPLAINER_LAYOUT).flatMap(l => l.p2));
    for (const name of p2) expect('links' in EXPLAINER_PIECES[name], name).toBe(false);
  });
});
