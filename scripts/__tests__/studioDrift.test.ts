import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// CIV-3172 (Ryan, "1"): close the gaps where Studio's own files could drift from the map.
describe('Studio files follow the map (CIV-3172)', () => {
  it('buses needed reads the map current feed unless the build pins one', async () => {
    const { vehiclesSource } = await import('../studio-builds');
    const b = { vehicles: { feed: { archive: '20261212-old' }, anchor: '20261121' } };
    expect(vehiclesSource('mbta', b, { lastRawArchiveKey: '20261212-new' })).toEqual({ feed: { archive: '20261212-new' }, anchor: null, current: true });
    expect(vehiclesSource('mbta', { vehicles: { ...b.vehicles, pinned: true } }, { lastRawArchiveKey: '20261212-new' })).toEqual({ feed: { archive: '20261212-old' }, anchor: '20261121', current: false });
    expect(vehiclesSource('hamilton', b, {})).toEqual({ feed: { archive: '20261212-old' }, anchor: '20261121', current: false });
  });

  it('every step that reads the ATLAS_* switches passes the same ones (#1874, Strategy on CIV-3176)', () => {
    const lines = readFileSync('.github/workflows/rebuild-release.yml', 'utf8').split('\n');
    const byStep = new Map<string, Set<string>>();
    let step = '';
    for (const line of lines) {
      const name = /^\s*- name:\s*(.+)$/.exec(line)?.[1];
      if (name) step = name;
      const sw = /^\s+(?:VAR_)?(ATLAS_[A-Z_]+):\s*\$\{\{\s*vars\.(ATLAS_[A-Z_]+)\s*\}\}/.exec(line);
      if (sw && sw[1] === sw[2]) byStep.set(step, new Set([...(byStep.get(step) ?? []), sw[1]]));
    }
    const studio = [...byStep].filter(([n]) => /Studio/.test(n));
    const publish = [...byStep].filter(([n]) => !/Studio/.test(n));
    expect(studio.length, 'a Studio build step reads the switches').toBeGreaterThan(0);
    expect(publish.length, 'a reprocess step reads the switches').toBeGreaterThan(0);
    const want = [...publish[0][1]].sort();
    for (const [n, s] of [...byStep]) expect([...s].sort(), n).toEqual(want);
    const allowed = /allowed="([^"]+)"/.exec(lines.join('\n'))?.[1].trim().split(/\s+/).sort();
    expect(allowed, 'the dry run\'s allowed switch list').toEqual(want);
  });
});
