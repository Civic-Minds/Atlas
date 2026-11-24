import { describe, expect, it } from 'vitest';
import { liveAgencyStatus, newestReportSec, worstLiveStatus } from '../liveStatus';
import { LIVE_FEED_PACE_SEC, LIVE_POLL_SEC, LIVE_STALE_PACES, livePaceSec } from '../rules/live';

describe('Live status (CIV-2084)', () => {
  it('is live within twice the agency pace, delayed past it, unavailable with no positions or a failed poll', () => {
    const now = 10_000;
    const limit = LIVE_STALE_PACES * livePaceSec('hamilton');
    expect(liveAgencyStatus({ slug: 'hamilton', newestSec: now - limit, failed: false }, now)).toBe('live');
    expect(liveAgencyStatus({ slug: 'hamilton', newestSec: now - limit - 1, failed: false }, now)).toBe('delayed');
    expect(liveAgencyStatus({ slug: 'hamilton', newestSec: null, failed: false }, now)).toBe('unavailable');
    expect(liveAgencyStatus({ slug: 'hamilton', newestSec: now, failed: true }, now)).toBe('unavailable');
  });

  it('reads the pace from the shared table, LIVE_POLL_SEC where unmeasured', () => {
    expect(livePaceSec('ttc')).toBe(LIVE_FEED_PACE_SEC.ttc);
    expect(livePaceSec('nowhere')).toBe(LIVE_POLL_SEC);
  });

  it('shows the worst state in view, and finds the newest report', () => {
    expect(worstLiveStatus(['live', 'delayed', 'live'])).toBe('delayed');
    expect(worstLiveStatus(['live', 'unavailable', 'delayed'])).toBe('unavailable');
    expect(worstLiveStatus([])).toBeNull();
    expect(newestReportSec([{ tsEpoch: 5 }, { tsEpoch: null }, { tsEpoch: 9 }])).toBe(9);
    expect(newestReportSec([])).toBeNull();
  });
});
