/**
 * Guard: Vercel deploys skip every file matched by .vercelignore, so a build-time
 * import of an ignored file fails the deploy (e.g. #666 added
 * scripts/agencyIndexGeneration.ts, imported by the prebuild catalog script, while
 * scripts/* was ignored). Walk the relative-import graph from the build entry
 * points and assert none of it is excluded from the upload.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '..');

function npmScriptFiles(name: string, scripts: Record<string, string>, seen = new Set<string>()): string[] {
  if (seen.has(name) || !scripts[name]) return [];
  seen.add(name);
  const cmd = scripts[name];
  const files = [...cmd.matchAll(/(?:^|\s)((?:scripts|pipeline|shared|api)\/[\w./-]+\.(?:ts|mjs|js))/g)].map(m => m[1]);
  for (const m of cmd.matchAll(/npm run ([\w:-]+)/g)) files.push(...npmScriptFiles(m[1], scripts, seen));
  return files;
}

function resolveImport(fromFile: string, spec: string): string | null {
  const base = resolve(dirname(fromFile), spec);
  const candidates = [base, base.replace(/\.js$/, '.ts'), base.replace(/\.js$/, '.tsx'), `${base}.ts`, `${base}.tsx`, `${base}/index.ts`];
  return candidates.find(c => existsSync(c) && !c.endsWith('/')) ?? null;
}

function importGraph(entries: string[]): string[] {
  const seen = new Set<string>();
  const stack = entries.map(e => resolve(ROOT, e));
  while (stack.length) {
    const file = stack.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    if (!/\.(ts|tsx|mjs|js)$/.test(file)) continue;
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/(?:from|import)\s*\(?\s*['"](\.{1,2}\/[^'"]+)['"]/g)) {
      const target = resolveImport(file, m[1]);
      if (target) stack.push(target);
    }
  }
  return [...seen].map(f => relative(ROOT, f));
}

describe('.vercelignore', () => {
  it('does not exclude any file the Vercel build imports', () => {
    const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')) as { scripts: Record<string, string> };
    const entries = [
      ...npmScriptFiles('prebuild', pkg.scripts),
      ...npmScriptFiles('build', pkg.scripts),
      ...npmScriptFiles('postbuild', pkg.scripts),
      'vite.config.ts',
      ...readdirSync(resolve(ROOT, 'api')).filter(f => /\.ts$/.test(f) && !f.endsWith('.test.ts')).map(f => `api/${f}`),
    ];
    expect(entries).toContain('scripts/build-agency-catalog.ts');

    const graph = importGraph(entries);
    const ignored = execFileSync(
      'git',
      ['ls-files', '--cached', '--others', '--ignored', '--exclude-from=.vercelignore', '--', ...graph],
      { cwd: ROOT, encoding: 'utf8' },
    ).split('\n').filter(Boolean);

    expect(ignored).toEqual([]);
  });
});
