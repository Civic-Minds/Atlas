import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// CIV-1402: docs/FEATURE_FLAGS.md said Live was off everywhere for weeks after VITE_LIVE_REPORTS_ENABLED was
// added to shared/config.ts and set on beta. These checks keep the doc and the code from drifting apart again.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CONFIG = 'shared/config.ts';
const DOC = 'docs/FEATURE_FLAGS.md';
const read = (file: string) => readFileSync(path.join(root, file), 'utf8');

/** The VITE_* names envFlag accepts: the union in its signature in shared/config.ts. */
function envFlagNames(): string[] {
  const signature = read(CONFIG).match(/function envFlag\(name:([^)]*)\)/);
  if (!signature) throw new Error(`${CONFIG}: the envFlag(name: ...) signature was not found; update this test to match how switches are listed.`);
  return [...signature[1].matchAll(/'(VITE_[A-Z0-9_]+)'/g)].map(m => m[1]);
}

/** Direct reads that have to stay outside shared/config.ts. Keep this short, and say why for each. */
const DIRECT_READ_ALLOWLIST: Record<string, string[]> = {
  // The bundler drops the lazy import of the Live vehicles layer (and deck.gl with it) from builds without Live
  // only when it sees the literal env read. Through FEATURES.live the public build gains those chunks.
  'src/components/Interval/MapCanvas.tsx': ['VITE_LIVE_ENABLED'],
};

const SOURCE_DIRS = ['src', 'shared', 'api', 'local-api'];

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      out.push(...sourceFiles(rel));
    } else if (/\.(ts|tsx|mts|js|mjs)$/.test(entry.name) && !/\.test\.[a-z]+$/.test(entry.name)) {
      out.push(rel);
    }
  }
  return out;
}

/** Every VITE_*_ENABLED name on a line that also reads import.meta (the env), per file. */
function directReads(): Array<{ file: string; name: string; line: number }> {
  const found: Array<{ file: string; name: string; line: number }> = [];
  for (const file of SOURCE_DIRS.flatMap(sourceFiles)) {
    if (file === CONFIG) continue;
    read(file).split('\n').forEach((text, index) => {
      if (!text.includes('import.meta')) return;
      for (const match of text.matchAll(/VITE_[A-Z0-9_]+_ENABLED/g)) found.push({ file, name: match[0], line: index + 1 });
    });
  }
  return found;
}

describe('feature switches and docs/FEATURE_FLAGS.md', () => {
  it('finds the switch list in shared/config.ts', () => {
    expect(envFlagNames()).toContain('VITE_LIVE_ENABLED');
  });

  it('has a table row in docs/FEATURE_FLAGS.md for every VITE_* switch envFlag reads', () => {
    const rows = read(DOC).split('\n').filter(line => line.startsWith('|'));
    const missing = envFlagNames().filter(name => !rows.some(row => row.includes(`\`${name}\``)));
    expect(
      missing,
      missing.map(name =>
        `${name} is in envFlag's list in ${CONFIG} but has no row in ${DOC}. Add a row to the "Current flags" table there with \`${name}\` in backticks in the Flag column, what it controls, and whether it is on for Production and for Beta.`,
      ).join('\n'),
    ).toEqual([]);
  });

  it('reads VITE_*_ENABLED switches from the env only in shared/config.ts', () => {
    const stray = directReads().filter(r => !DIRECT_READ_ALLOWLIST[r.file]?.includes(r.name));
    expect(
      stray,
      stray.map(({ file, name, line }) =>
        `${file}:${line} reads ${name} from import.meta.env. Add ${name} to envFlag's list and to FEATURES in ${CONFIG}, and read FEATURES.<name> here instead. Only if that is impossible, add the file to DIRECT_READ_ALLOWLIST in src/__tests__/featureFlagDocs.test.ts with a comment saying why.`,
      ).join('\n'),
    ).toEqual([]);
  });

  it('has no allowlisted direct read that is gone', () => {
    const reads = directReads();
    const stale = Object.entries(DIRECT_READ_ALLOWLIST).flatMap(([file, names]) =>
      names.filter(name => !reads.some(r => r.file === file && r.name === name)).map(name => `${file}: ${name}`));
    expect(stale, `Remove these from DIRECT_READ_ALLOWLIST in src/__tests__/featureFlagDocs.test.ts; the file no longer reads them:\n${stale.join('\n')}`).toEqual([]);
  });
});
