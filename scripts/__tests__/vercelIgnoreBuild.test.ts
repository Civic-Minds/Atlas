import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

// scripts/vercel-ignore-build.sh is vercel.json's ignoreCommand: exit 0 skips the Vercel build, exit 1 builds.
const script = resolve(__dirname, '../vercel-ignore-build.sh');

// #1576: every case makes git commits in a temp repo and runs the script; under a loaded full run that passed
// vitest's 5 s default, so the cases get 30 s.
describe('vercel-ignore-build.sh', { timeout: 30_000 }, () => {
  let repo = '';
  const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
  const commit = (files: Record<string, string>): string => {
    for (const [file, text] of Object.entries(files)) {
      mkdirSync(dirname(join(repo, file)), { recursive: true });
      writeFileSync(join(repo, file), text);
    }
    git('add', '-A');
    git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--no-verify', '-m', 'c');
    return git('rev-parse', 'HEAD');
  };
  const run = (prev: string, curr: string, ref?: string) => {
    const env: NodeJS.ProcessEnv = { ...process.env };
    delete env.VERCEL_GIT_COMMIT_REF;
    if (ref !== undefined) env.VERCEL_GIT_COMMIT_REF = ref;
    return spawnSync('bash', [script, prev, curr], { cwd: repo, encoding: 'utf8', env }).status;
  };
  // Exit code for a commit that changes `files` on top of the current tip.
  const exitFor = (files: Record<string, string>) => {
    const prev = git('rev-parse', 'HEAD');
    return run(prev, commit(files));
  };

  beforeAll(() => {
    repo = mkdtempSync(join(tmpdir(), 'vercel-ignore-'));
    git('init', '-q');
    copyFileSync(script, join(repo, 'vercel-ignore-build.sh'));
    commit({
      '.vercelignore': 'pipeline/\nscripts/*\n!scripts/prerender-routes.ts\n',
      'README.md': 'a', 'src/a.ts': 'a', 'scripts/prerender-routes.ts': 'a', 'scripts/audit.ts': 'a',
    });
  }, 30_000);

  it('skips commits that only touch docs, the changelog, pipeline or unbuilt scripts', () => {
    expect(exitFor({ 'docs/data/X.md': 'b', 'CHANGELOG.md': 'b', 'README.md': 'b' })).toBe(0);
    expect(exitFor({ 'pipeline/process-core.ts': 'b', '.github/workflows/x.yml': 'b' })).toBe(0);
    expect(exitFor({ 'scripts/audit.ts': 'b', 'docs/research/x/data.json': 'b' })).toBe(0);
  });

  it('builds when site code, data, legal pages or build scripts change', () => {
    expect(exitFor({ 'src/a.ts': 'c' })).toBe(1);
    expect(exitFor({ 'shared/data/agency-pages.json': 'c' })).toBe(1);
    expect(exitFor({ 'public/data/index.json': 'c' })).toBe(1);
    expect(exitFor({ 'config/agencies/ttc.json': 'c' })).toBe(1);
    expect(exitFor({ 'docs/legal/TERMS.md': 'c' })).toBe(1);
    expect(exitFor({ 'package.json': 'c' })).toBe(1);
    // Re-included in .vercelignore, so the build uses it.
    expect(exitFor({ 'scripts/prerender-routes.ts': 'c' })).toBe(1);
  });

  it('builds when the previous deploy is missing or unknown', () => {
    const head = git('rev-parse', 'HEAD');
    expect(run('', head)).toBe(1);
    expect(run('0123456789abcdef0123456789abcdef01234567', head)).toBe(1);
  });

  it('skips every branch except main before looking at paths', () => {
    const prev = git('rev-parse', 'HEAD');
    const curr = commit({ 'src/a.ts': 'd' });
    expect(run(prev, curr, 'main')).toBe(1);
    expect(run(prev, curr, 'chore/some-helper-branch')).toBe(0);
    expect(run(prev, curr, 'beta')).toBe(0);
    // Unset (local use) still runs the path check.
    expect(run(prev, curr)).toBe(1);
    // main keeps the path check: a docs-only push is still skipped, an unknown previous deploy still builds.
    expect(run(curr, commit({ 'README.md': 'd' }), 'main')).toBe(0);
    expect(run('', curr, 'main')).toBe(1);
    expect(run('', curr, 'feat/x')).toBe(0);
  });
});
