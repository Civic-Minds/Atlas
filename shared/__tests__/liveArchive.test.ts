import { describe, expect, it } from 'vitest';
import { datesForWindow } from '../liveArchive';

describe('datesForWindow', () => {
  it('returns a single date for a window entirely within one UTC day', () => {
    // 2026-07-16 15:00:00 UTC, last 60 minutes
    const now = Date.UTC(2026, 6, 16, 15, 0, 0);
    expect(datesForWindow(now, 60)).toEqual(['2026-07-16']);
  });

  it('spans two UTC dates when the window straddles midnight UTC', () => {
    // 2026-07-16 00:20:00 UTC (~8:20pm Toronto in July, EDT) — last hour touches 07-15 too
    const now = Date.UTC(2026, 6, 16, 0, 20, 0);
    expect(datesForWindow(now, 60).sort()).toEqual(['2026-07-15', '2026-07-16']);
  });

  it('does not spuriously include a third date for a short window', () => {
    const now = Date.UTC(2026, 6, 16, 0, 5, 0);
    const dates = datesForWindow(now, 30);
    expect(dates.length).toBeLessThanOrEqual(2);
    expect(dates).toContain('2026-07-16');
  });
});
