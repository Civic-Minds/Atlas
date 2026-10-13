import { describe, expect, it } from 'vitest';
import { buildChangelog, manifestDay } from '../changelog';
import { WHATS_NEW } from '../../data/whatsNew';
import type { WhatsNewRelease } from '../../data/whatsNew';

const RELEASES: WhatsNewRelease[] = [
  { version: '3.3.0', month: 'October 2026', date: '2026-10-12', items: [{ text: 'New thing.' }] },
  { version: '3.2.0', month: 'September 2026', date: '2026-09-22', items: [{ text: 'Older thing.' }] },
];

describe('buildChangelog', () => {
  it('puts a data update on the version whose period it falls in; others stay as lines', () => {
    const entries = buildChangelog(RELEASES, [
      { releaseId: 'release-b', generatedAt: '2026-10-14T05:00:00Z' },
      { releaseId: 'release-a', generatedAt: '2026-10-01T05:00:00Z' },
      { releaseId: 'release-0', generatedAt: '2026-08-01T05:00:00Z' },
    ]);
    expect(entries.map(e => e.label)).toEqual(['Version 3.3', 'Version 3.2', 'Map data updated Aug 1, 2026']);
    expect(entries.map(e => (e.kind === 'app' ? e.dataUpdated : undefined))).toEqual(['Oct 14, 2026', 'Oct 1, 2026', undefined]);
  });

  it('skips duplicate or undated data releases', () => {
    const entries = buildChangelog(RELEASES, [
      { releaseId: 'release-a', generatedAt: '2026-10-12T01:00:00Z' },
      { releaseId: 'release-a', generatedAt: '2026-10-12T01:00:00Z' },
      { releaseId: 'release-x' },
      { releaseId: 'release-y', generatedAt: 'soon' },
    ]);
    expect(entries.map(e => e.kind)).toEqual(['app', 'app']);
    expect(entries[0].kind === 'app' && entries[0].dataUpdated).toBe('Oct 12, 2026');
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
