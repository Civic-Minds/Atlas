import { afterAll, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const root = join(mkdtempSync(join(tmpdir(), 'mcp-buses-')), 'Atlas');
mkdirSync(join(root, 'tmp', 'studio'), { recursive: true });
const before = process.env.ATLAS_ROOT;
process.env.ATLAS_ROOT = root;
afterAll(() => { if (before == null) delete process.env.ATLAS_ROOT; else process.env.ATLAS_ROOT = before; });

describe('buses_needed files (CIV-1910)', () => {
  it('says only that there are no figures, with no build command or path (#1613)', async () => {
    const { busesNeeded } = await import('../mcp/localData');
    expect(busesNeeded('nowhere', '1', 'pm')).toEqual({ cached: false });
  });
});
