import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { applyPublishFlags, PUBLISH_FLAGS, publishFlagsToSet } from '../lib/publishFlags';

describe('publish flags for Mac builds (#1708)', () => {
  const allOn = Object.fromEntries(PUBLISH_FLAGS.map(f => [f, '1']));

  it('turns on every switch the repo variables set to 1, as the publish job does', () => {
    const env: Record<string, string | undefined> = {};
    expect(applyPublishFlags(env, () => ({ ...allOn, ATLAS_PIECE_READING: '0', STUDIO_LIVE_DAILY: '1' })))
      .toEqual(['ATLAS_HEADLINE_FROM_TRUNK', 'ATLAS_BRANCH_READINGS', 'ATLAS_PIECES_BY_TRIPS']);
    expect(env).toEqual({ ATLAS_HEADLINE_FROM_TRUNK: '1', ATLAS_BRANCH_READINGS: '1', ATLAS_PIECES_BY_TRIPS: '1' });
  });

  it('leaves a switch the shell set, and all of them with ATLAS_PUBLISH_FLAGS=none', () => {
    expect(publishFlagsToSet(allOn, { ATLAS_PIECE_READING: '0' })).not.toContain('ATLAS_PIECE_READING');
    const env = { ATLAS_PUBLISH_FLAGS: 'none' };
    expect(applyPublishFlags(env, () => { throw new Error('not read'); })).toEqual([]);
    expect(env).toEqual({ ATLAS_PUBLISH_FLAGS: 'none' });
  });

  it('stops rather than building with every switch off when the variables cannot be read', () => {
    expect(() => applyPublishFlags({}, () => { throw new Error('gh: not logged in'); })).toThrow(/ATLAS_PUBLISH_FLAGS=none/);
  });

  it('names the same switches as the rebuild workflow', () => {
    const yml = readFileSync('.github/workflows/rebuild-release.yml', 'utf8');
    const allowed = /allowed=" ([A-Z_ ]+) "/.exec(yml)?.[1].split(' ');
    expect(allowed).toEqual([...PUBLISH_FLAGS]);
  });
});
