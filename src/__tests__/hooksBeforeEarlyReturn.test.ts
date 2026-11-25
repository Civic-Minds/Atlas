import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

// #1812 (Ryan, 2026-11-25: "The map couldn't be shown because of an error. seeing this a lot"): LiveVehicles called
// hooks after `if (!active) return null;`, so turning Live off or on changed its hook count and React threw, taking the
// whole map down. Every component and hook calls all its hooks before its first early return. This reads src/ and
// fails on a hook call (use…) in a component or hook's body after a top-level `if (…) return`.
const ROOT = resolve(__dirname, '../..');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : files(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

const isHookName = (name: string) => /^use[A-Z]/.test(name);
const isComponentOrHook = (name: string | undefined) => !!name && (/^[A-Z]/.test(name) || isHookName(name));

/** Hook calls in a statement, not counting those inside functions it defines (callbacks run later). */
function hookCalls(node: ts.Node, out: string[] = []): string[] {
  if (ts.isFunctionLike(node)) return out;
  if (ts.isCallExpression(node)) {
    const callee = node.expression;
    const name = ts.isIdentifier(callee) ? callee.text : ts.isPropertyAccessExpression(callee) ? callee.name.text : '';
    if (isHookName(name)) out.push(name);
  }
  node.forEachChild(child => { hookCalls(child, out); });
  return out;
}

const returnsEarly = (s: ts.Statement) => ts.isIfStatement(s) && (ts.isReturnStatement(s.thenStatement)
  || (ts.isBlock(s.thenStatement) && s.thenStatement.statements.some(ts.isReturnStatement)));

function functionName(node: ts.Node): string | undefined {
  if ((ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node)) && node.name) return node.name.text;
  let p: ts.Node | undefined = node.parent;
  while (p && (ts.isCallExpression(p) || ts.isParenthesizedExpression(p))) p = p.parent; // forwardRef(…), memo(…)
  return p && ts.isVariableDeclaration(p) && ts.isIdentifier(p.name) ? p.name.text : undefined;
}

function offences(path: string, text = readFileSync(path, 'utf8')): string[] {
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
  const found: string[] = [];
  const visit = (node: ts.Node) => {
    if ((ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node))
      && node.body && ts.isBlock(node.body) && isComponentOrHook(functionName(node))) {
      let returned = false;
      for (const statement of node.body.statements) {
        if (returned) {
          for (const hook of hookCalls(statement)) {
            found.push(`${relative(ROOT, path)}:${source.getLineAndCharacterOfPosition(statement.getStart()).line + 1} ${functionName(node)} calls ${hook} after an early return`);
          }
        }
        if (returnsEarly(statement)) returned = true;
      }
    }
    node.forEachChild(visit);
  };
  visit(source);
  return found;
}

describe('hooks before early returns (#1812)', () => {
  it('no component or hook calls a hook after an early return', () => {
    expect(files(join(ROOT, 'src')).flatMap(f => offences(f))).toEqual([]);
  });

  it('catches the shape that took the map down', () => {
    const sample = `export default function LiveVehicles({ active }) {
  const [a] = useState(0);
  const pick = useCallback(() => { if (!a) return; useNothing(); }, [a]);
  if (!active) return null;
  const { setRetryAt } = useLiveFeedsDown();
  useEffect(() => () => setRetryAt(null), [setRetryAt]);
  return null;
}`;
    expect(offences(join(ROOT, 'src/sample.tsx'), sample)).toEqual([
      'src/sample.tsx:5 LiveVehicles calls useLiveFeedsDown after an early return',
      'src/sample.tsx:6 LiveVehicles calls useEffect after an early return',
    ]);
  });
});
