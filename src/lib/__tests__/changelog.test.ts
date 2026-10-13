import { describe, expect, it } from 'vitest';
import { buildChangelog, manifestDay } from '../changelog';
import { WHATS_NEW } from '../../data/whatsNew';
import type { WhatsNewRelease } from '../../data/whatsNew';

const RELEASES: WhatsNewRelease[] = [
  { version: '3.3.0', month: 'October 2026', date: '2026-10-12', items: [{ text: 'New thing.' }] },
  { version: '3.2.0', month: 'September 2026', date: '2026-09-22', items: [{ text: 'Older thing.' }] },
];

describe('buildChangelog', () => {
  it('interleaves app versions and data releases by date, newest first', () => {
    const entries = buildChangelog(RELEASES, [
      { releaseId: 'release-b', generatedAt: '2026-10-14T05:00:00Z' },
      { releaseId: 'release-a', generatedAt: '2026-10-01T05:00:00Z' },
    ]);
    expect(entries.map(e => e.label)).toEqual([
      'Map data updated Oct 14, 2026',
      'App version 3.3',
      'Map data updated Oct 1, 2026',
      'App version 3.2',
    ]);
  });

  it('lists the app version first on the same day and skips duplicate or undated data releases', () => {
    const entries = buildChangelog(RELEASES, [
      { releaseId: 'release-a', generatedAt: '2026-10-12T01:00:00Z' },
      { releaseId: 'release-a', generatedAt: '2026-10-12T01:00:00Z' },
      { releaseId: 'release-x' },
      { releaseId: 'release-y', generatedAt: 'soon' },
    ]);
    expect(entries.map(e => e.kind)).toEqual(['app', 'data', 'app']);
  });

  it('works with no data releases', () => {
    expect(buildChangelog(RELEASES, []).map(e => e.kind)).toEqual(['app', 'app']);
  });

  it('manifestDay never invents a date', () => {
    expect(manifestDay(undefined)).toBeNull();
    expect(manifestDay('nope')).toBeNull();
    expect(manifestDay('2026-10-09T05:21:01.950Z')).toBe('2026-10-09');
  });

  it('keeps the real release list newest first', () => {
    const dates = WHATS_NEW.map(r => r.date);
    expect(dates).toEqual([...dates].sort().reverse());
  });
});
