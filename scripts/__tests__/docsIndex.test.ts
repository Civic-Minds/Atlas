import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// One index, one row per doc: docs/README.md. Studies under docs/research/ are covered by
// docs/research/INDEX.md instead. A new doc without a row here fails this test.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const indexPath = path.join(root, 'docs', 'README.md');

function markdownFiles(): string[] {
  const out = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '*.md'], {
    cwd: root,
    encoding: 'utf8',
  });
  return out.split('\n').filter(Boolean);
}

/** Relative link targets in the index, resolved from the repo root, fragments removed. */
function indexLinks(): string[] {
  const text = readFileSync(indexPath, 'utf8');
  const targets: string[] = [];
  for (const match of text.matchAll(/\]\(([^)\s]+)\)/g)) {
    const raw = match[1];
    if (/^[a-z]+:/i.test(raw) || raw.startsWith('#')) continue;
    const file = raw.split('#')[0];
    if (!file) continue;
    targets.push(path.relative(root, path.resolve(path.dirname(indexPath), file)));
  }
  return targets;
}

describe('docs index (docs/README.md)', () => {
  it('has a row for every root markdown file and every markdown file under docs/ outside docs/research/', () => {
    const linked = new Set(indexLinks());
    const needsRow = markdownFiles().filter((file) => {
      if (file === 'docs/README.md') return false; // the index itself
      if (!file.includes('/')) return true; // root .md
      return file.startsWith('docs/') && !file.startsWith('docs/research/');
    });
    const missing = needsRow.filter((file) => !linked.has(file));
    expect(missing, `Add a row to docs/README.md for: ${missing.join(', ')}`).toEqual([]);
  });

  it('links only to files that exist', () => {
    const broken = indexLinks().filter((target) => !existsSync(path.join(root, target)));
    expect(broken, `Broken links in docs/README.md: ${broken.join(', ')}`).toEqual([]);
  });

  it('lists docs/research/INDEX.md, which covers every study folder', () => {
    expect(indexLinks()).toContain('docs/research/INDEX.md');
  });
});
