import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// CIV-1775: no "[Placeholder" text in a public or beta build. Placeholder text is a stand-in for wording Ryan has not
// given yet (CIV-1766, CIV-1705). It may only sit behind a flag that is true only on the Vite dev server, and each such
// file is listed here with its flag. Any other hit fails. Tests are not scanned; comments are, so a comment that quotes
// the marker needs rewording.
const ROOT = resolve(__dirname, '../../..');
const SCANNED = ['src', 'shared'];
const MARKER = '[Placeholder';

/** Each file allowed to hold the marker, the FEATURES key that gates it, and why. */
const DEV_ONLY: Array<{ file: string; flag: string; why: string }> = [
  { file: 'src/components/Interval/FilterChips.tsx', flag: 'connectionsBar', why: 'connections bar side labels (CIV-1766); App.tsx only builds the bar when the flag is on' },
  { file: 'src/PlannersPage.tsx', flag: 'plannersLink', why: 'planners Live card (CIV-1705); the route, footer link and prerender page all need the flag' },
];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : files(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

/** The line of shared/config.ts that defines FEATURES.<flag>'s constant, and the constant's own definition. */
function flagDefinition(flag: string): string | null {
  const config = readFileSync(join(ROOT, 'shared/config.ts'), 'utf8');
  const entry = config.match(new RegExp(`^\\s*${flag}:\\s*([A-Z_]+),`, 'm'));
  if (!entry) return null;
  return config.match(new RegExp(`^export const ${entry[1]}\\s*=\\s*(.+);$`, 'm'))?.[1] ?? null;
}

const hits = SCANNED.flatMap(dir => files(join(ROOT, dir))).filter(path => readFileSync(path, 'utf8').includes(MARKER))
  .map(path => relative(ROOT, path));

describe('placeholder text guard (CIV-1775)', () => {
  it('finds the marker only in listed dev-only files', () => {
    const unlisted = hits.filter(file => !DEV_ONLY.some(entry => entry.file === file));
    expect(unlisted, `"${MARKER}" text in a file that is not dev-only: ${unlisted.join(', ')}. Give it real wording, or gate it behind a dev-only flag and list it in DEV_ONLY in placeholderGuard.test.ts.`).toEqual([]);
  });

  it('lists no file that no longer has the marker', () => {
    const stale = DEV_ONLY.filter(entry => !hits.includes(entry.file)).map(entry => entry.file);
    expect(stale, `Remove from DEV_ONLY, the marker is gone: ${stale.join(', ')}`).toEqual([]);
  });

  it.each(DEV_ONLY.map(entry => [entry.flag, entry.file, entry.why]))('flag %s (%s) is true only on the dev server', (flag) => {
    const definition = flagDefinition(flag);
    expect(definition, `FEATURES.${flag} was not found in shared/config.ts`).not.toBeNull();
    expect(definition, `FEATURES.${flag} is not dev-only: ${definition}`).toMatch(/import\.meta\.env\.DEV\s*$/);
    expect(definition).not.toMatch(/\|\||BETA_BUILD|PUBLIC/);
  });

  it('catches an unlisted hit', () => {
    expect(['src/NewPage.tsx'].filter(file => !DEV_ONLY.some(entry => entry.file === file))).toEqual(['src/NewPage.tsx']);
  });
});
