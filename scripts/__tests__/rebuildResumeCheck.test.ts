import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// #1865: a rebuild resumed at start_at=publish was refused once the run's own stamps pull request merged.
const SCRIPT = resolve('scripts/rebuild-resume-check.sh');

let repo: string;
const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
const write = (path: string, text: string) => writeFileSync(join(repo, path), text);
const commit = (message: string) => { git('add', '-A'); git('commit', '-q', '-m', message); return git('rev-parse', 'HEAD'); };
const run = () => spawnSync('bash', [SCRIPT, 'tmp/rebuild-state', 'tmp/rebuild-manifest'], { cwd: repo, encoding: 'utf8' });

/** What the reprocess run saves: the commit it built, its stamps as a patch, and the manifest's commit. */
function saveRun(built: string) {
  write('config/avon.json', '{"lastFeedExpiry":"20270411"}\n');
  git('add', '-A');
  const patch = execFileSync('git', ['diff', '--cached', '--binary'], { cwd: repo, encoding: 'utf8' });
  git('reset', '-q', '--hard', built);
  for (const dir of ['tmp/rebuild-state', 'tmp/rebuild-manifest']) {
    mkdirSync(join(repo, dir), { recursive: true });
    write(`${dir}/sha.txt`, `${built}\n`);
  }
  write('tmp/rebuild-state/stamps.patch', patch);
}

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'resume-check-'));
  git('init', '-q');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'test');
  write('.gitignore', 'tmp/\n');
  mkdirSync(join(repo, 'config'));
  write('config/avon.json', '{"lastFeedExpiry":"20261125"}\n');
  write('config/other.json', '{}\n');
});
afterEach(() => rmSync(repo, { recursive: true, force: true }));

describe('rebuild-resume-check.sh', () => {
  it('on the built commit, puts the saved stamps back', () => {
    const built = commit('built');
    saveRun(built);
    const result = run();
    expect(result.status).toBe(0);
    expect(readFileSync(join(repo, 'config/avon.json'), 'utf8')).toContain('20270411');
  });

  it("resumes when main moved on only by the run's own stamps pull request (#1865)", () => {
    const built = commit('built');
    saveRun(built);
    write('config/avon.json', '{"lastFeedExpiry":"20270411"}\n');
    commit('chore: reprocess feed expiry stamps');
    const result = run();
    expect(result.stdout).toContain('plus its own stamps');
    expect(result.status).toBe(0);
  });

  it('refuses when main has another change besides the stamps', () => {
    const built = commit('built');
    saveRun(built);
    write('config/avon.json', '{"lastFeedExpiry":"20270411"}\n');
    commit('chore: reprocess feed expiry stamps');
    write('config/other.json', '{"changed":true}\n');
    commit('unrelated');
    const result = run();
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('changes besides');
  });

  it('refuses when main moved on but the run saved no stamps', () => {
    const built = commit('built');
    for (const dir of ['tmp/rebuild-state', 'tmp/rebuild-manifest']) {
      mkdirSync(join(repo, dir), { recursive: true });
      write(`${dir}/sha.txt`, `${built}\n`);
    }
    write('config/other.json', '{"changed":true}\n');
    commit('unrelated');
    expect(run().status).toBe(1);
  });

  it('refuses stamps and a manifest from different builds', () => {
    const first = commit('built');
    write('config/other.json', '{"x":1}\n');
    const second = commit('next');
    saveRun(second);
    write('tmp/rebuild-manifest/sha.txt', `${first}\n`);
    const result = run();
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('different builds');
  });
});
