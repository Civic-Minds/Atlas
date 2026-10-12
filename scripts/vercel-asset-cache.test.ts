/**
 * Guard: Vite's hashed build files under /assets get a one-year immutable cache, while
 * every non-hashed file (index.html, release.json, data, and the hand-placed images in
 * public/assets) keeps Vercel's default revalidating cache so new deploys show up.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '..');
const config = JSON.parse(readFileSync(resolve(ROOT, 'vercel.json'), 'utf8')) as {
  headers?: { source: string; headers: { key: string; value: string }[] }[];
};

const rule = config.headers?.find(h => h.headers.some(x => x.key === 'Cache-Control' && x.value.includes('immutable')));

function sourceToRegExp(source: string): RegExp {
  // Only the `/prefix/:name(regex)` shape is used; anything else should fail loudly.
  const m = source.match(/^(\/[\w/-]*\/):\w+\((.+)\)$/);
  if (!m) throw new Error(`Unexpected header source shape: ${source}`);
  return new RegExp(`^${m[1]}(?:${m[2]})$`);
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

describe('vercel.json asset cache headers', () => {
  it('caches hashed build assets for a year', () => {
    expect(rule).toBeDefined();
    expect(rule!.headers).toEqual([{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }]);
    const re = sourceToRegExp(rule!.source);
    for (const path of ['/assets/index-DKrfZp8I.js', '/assets/index-DCJCrhxr.css', '/assets/maplibre-a_B-9xYz.js', '/assets/worker-Ab12Cd34.js']) {
      expect(path, path).toMatch(re);
    }
  });

  it('does not match any non-hashed file', () => {
    const re = sourceToRegExp(rule!.source);
    const publicFiles = walk(resolve(ROOT, 'public')).map(f => `/${relative(resolve(ROOT, 'public'), f)}`);
    for (const path of [...publicFiles, '/', '/index.html', '/release.json', '/assets/', '/assets/index.js']) {
      expect(path, path).not.toMatch(re);
    }
  });
});
