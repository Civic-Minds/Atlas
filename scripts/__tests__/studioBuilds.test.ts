import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { mdbUrl } from '../studio-builds';

const config = JSON.parse(readFileSync('config/studio-builds.json', 'utf8')) as { agencies: Record<string, Record<string, { feed: Record<string, string>; date?: string; anchor?: string }>> };

describe('Studio builds config (CIV-1974)', () => {
  it('names every feed by an archive zip or a MobilityDatabase dataset, with an 8-digit date', () => {
    for (const [slug, build] of Object.entries(config.agencies)) {
      for (const part of ['vehicles', 'before', 'after'] as const) {
        const { feed, date, anchor } = build[part];
        expect(Object.keys(feed), `${slug} ${part}`).toHaveLength(1);
        if (feed.archive) expect(feed.archive, `${slug} ${part}`).toMatch(/^[\w-]+-[0-9a-f]{16}$/);
        else expect(feed.mdb, `${slug} ${part}`).toMatch(/^mdb-\d+-\d{12}$/);
        expect(part === 'vehicles' ? anchor : date, `${slug} ${part}`).toMatch(/^\d{8}$/);
      }
    }
  });

  it("reads a MobilityDatabase dataset from its public file", () => {
    expect(mdbUrl('mdb-2618-202606160002')).toBe('https://files.mobilitydatabase.org/mdb-2618/mdb-2618-202606160002/mdb-2618-202606160002.zip');
  });
});
