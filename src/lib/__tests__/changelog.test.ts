import { describe, expect, it } from 'vitest';
import { buildChangelog } from '../changelog';
import { WHATS_NEW } from '../../data/whatsNew';
import type { WhatsNewRelease } from '../../data/whatsNew';

const RELEASES: WhatsNewRelease[] = [
  { version: '3.2.0', month: 'September 2026', date: '2026-09-22', items: [{ text: 'Older thing.' }] },
  { version: '3.3.0', month: 'October 2026', date: '2026-10-12', items: [{ text: 'New thing.' }] },
];

describe('buildChangelog', () => {
  it('lists one entry per version, newest first, with no map data lines', () => {
    const entries = buildChangelog(RELEASES);
    expect(entries.map(e => e.label)).toEqual(['Version 3.3', 'Version 3.2']);
    expect(entries.map(e => e.key)).toEqual(['app-3.3.0', 'app-3.2.0']);
  });

  it('has the real releases', () => {
    expect(buildChangelog(WHATS_NEW).length).toBe(WHATS_NEW.length);
  });
});
