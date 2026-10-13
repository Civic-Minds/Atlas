import { describe, expect, it } from 'vitest';
import { archiveUnchangedFeedIfMissing, tryArchiveUnchangedFeed } from '../archiveIfMissing';

const fakeR2 = (keys: string[]) => {
  const puts: string[] = [];
  return { puts, deps: { listArchive: async () => keys.map(key => ({ key })), putArchive: async (key: string) => { puts.push(key); } } };
};

// #612: an unchanged feed published without an archive copy is archived when refresh skips it.
describe('archiveUnchangedFeedIfMissing', () => {
  it('archives the skipped feed when the agency has no archived zip', async () => {
    const r2 = fakeR2([]);
    const key = await archiveUnchangedFeedIfMissing('metra', Buffer.from('zip'), '20261231', null, r2.deps);
    expect(key).toMatch(/^gtfs\/archive\/metra\/20261231-[0-9a-f]+\.zip$/);
    expect(r2.puts).toEqual([key]);
  });

  it('archives the live schedule when the archive holds only older ones (cascades-east)', async () => {
    const r2 = fakeR2(['gtfs/archive/cascades-east/20260805.zip', 'gtfs/archive/cascades-east/20260908.zip']);
    const key = await archiveUnchangedFeedIfMissing('cascades-east', Buffer.from('zip'), '20271231', null, r2.deps);
    expect(key).toMatch(/^gtfs\/archive\/cascades-east\/20271231-[0-9a-f]+\.zip$/);
  });

  it('does not add a copy when the same schedule is archived, even with different bytes', async () => {
    const r2 = fakeR2(['gtfs/archive/las-cruces/20271231.zip']);
    expect(await archiveUnchangedFeedIfMissing('las-cruces', Buffer.from('other'), '20271231', null, r2.deps)).toBeNull();
  });

  it('leaves an agency that already has its live schedule archived alone', async () => {
    const r2 = fakeR2(['gtfs/archive/ttc/20261031-79294c53420b9859.zip']);
    expect(await archiveUnchangedFeedIfMissing('ttc', Buffer.from('zip'), '20261031', null, r2.deps)).toBeNull();
    expect(r2.puts).toEqual([]);
  });

  it('ignores non-zip objects', async () => {
    const r2 = fakeR2(['gtfs/archive/duke/notes.json']);
    expect(await archiveUnchangedFeedIfMissing('duke', Buffer.from('zip'), null, 'v1', r2.deps)).not.toBeNull();
  });

  it('on refresh, an archive failure is a warning and the agency stays skipped', async () => {
    const logs: string[] = [];
    const deps = { listArchive: async () => [], putArchive: async () => { throw new Error('R2 503'); } };
    await expect(tryArchiveUnchangedFeed('metra', Buffer.from('zip'), '20261231', null, m => logs.push(m), deps)).resolves.toBeNull();
    expect(logs.join('')).toMatch(/\[warn\] metra: could not archive the unchanged live feed \(R2 503\); kept as skipped/);
  });
});
