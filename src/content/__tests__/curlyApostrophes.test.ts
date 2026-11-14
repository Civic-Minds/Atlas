import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

// CIV-1160 question 1 (Ryan, 2026-11-13: "re 1:option 1"): a curly ’ in every apostrophe users see. This reads every string,
// template and JSX text in src/ and shared/ (code and comments don't count) and fails on a straight ' inside a word
// ("can't"), a possessive after a name ("${agency}'s") or after a plural ("agencies' routes").
const ROOT = resolve(__dirname, '../../..');

// Files whose apostrophes are names or code, not our wording: name casing rules, inline CSS font names, agency stop and
// place names as the agency writes them ("D'Arcy St", "Côte d'Azur"), a developer check's message, and the card's
// internal reasons for dropping a notice.
const NAMES_OR_CODE = new Set([
  'src/utils/nameCase.ts',
  'src/lib/mapHtml.ts',
  'src/data/cobourgOnDemandStops.ts',
  'src/data/ctranCurrentFlexStops.ts',
  'src/data/edmontonOnDemandData.ts',
  'src/data/flexBatchData.ts',
  'src/data/leamingtonLtGoStops.ts',
  'src/data/mvtaConnectData.ts',
  'src/data/onDemandSources.ts',
  'src/utils/routeCardNotices.ts',
  'shared/regionCountry.ts',
  'shared/areas.ts',
]);

function files(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : files(path);
    return /\.tsx?$/.test(name) && !/\.(test|d)\.tsx?$/.test(name) ? [path] : [];
  });
}

const STRAIGHT = /^'s\b|(\p{L}|\d)\\?'(?=\p{L})|\p{L}s\\?'(?=[\s,.;:)]|$)/u;

/** "file:line: text" for each string, template part or JSX text with a straight apostrophe. */
export function straightApostrophes(name: string, source: string): string[] {
  const sf = ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true, name.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const K = ts.SyntaxKind;
  const found: string[] = [];
  const visit = (node: ts.Node) => {
    const k = node.kind;
    const literal = k === K.StringLiteral || k === K.NoSubstitutionTemplateLiteral || k === K.TemplateHead || k === K.TemplateMiddle || k === K.TemplateTail;
    if ((literal || k === K.JsxText) && !(node.parent && (ts.isImportDeclaration(node.parent) || ts.isExportDeclaration(node.parent)))) {
      const raw = node.getText(sf);
      const inner = literal ? raw.slice(1, k === K.TemplateHead || k === K.TemplateMiddle ? -2 : -1) : raw;
      if (STRAIGHT.test(inner)) found.push(`${name}:${sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1}: ${inner.trim().slice(0, 100)}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

describe('apostrophes users see are curly (CIV-1160)', () => {
  it('no straight apostrophe in any UI string in src/ or shared/', () => {
    const offenders = ['src', 'shared'].flatMap(dir => files(join(ROOT, dir)))
      .map(f => [relative(ROOT, f), f] as const)
      .filter(([name]) => !NAMES_OR_CODE.has(name))
      .flatMap(([name, f]) => straightApostrophes(name, readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('catches each kind of slip and leaves code alone', () => {
    const src = [
      'const a = "This route\'s line can\'t be shown.";',
      "const b = 'wasn\\'t timed';",
      'const c = `${agency}\'s schedule ended`;',
      'const d = "Some agencies\' routes didn’t load.";',
      'const e = <p>We couldn\'t find that page.</p>;',
    ].join('\n');
    expect(straightApostrophes('x.tsx', src).map(s => s.split(':')[1])).toEqual(['1', '2', '3', '4', '5']);
    const fine = "import x from './x';\nconst k = { 'a-b': 1 };\nconst s = 'This route’s line';\nconst t = `${a}’s`;\nconst u = <p>Can’t</p>;";
    expect(straightApostrophes('y.tsx', fine)).toEqual([]);
  });
});
