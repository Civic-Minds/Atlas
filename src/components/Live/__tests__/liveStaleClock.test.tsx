import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import LiveStaleClock, { staleReportSec } from '../LiveStaleClock';
import { RIGHT_NOW_STALE_SEC, agencyTime } from '../LiveRoutePerformance';
import { liveLocationsUpdatedAt } from '../../../content/noticeCopy';

// 1:15 PM ET, Friday 2026-11-27.
const NOW_MS = Date.UTC(2026, 10, 27, 18, 15, 0);
const NOW = NOW_MS / 1000;

describe('CIV-3047 B: the Live route card\'s clock', () => {
  afterEach(() => vi.useRealTimers());

  it('shows nothing while the vehicles are reporting', () => {
    expect(staleReportSec([{ tsEpoch: NOW - 30 }], NOW_MS)).toBeNull();
    expect(staleReportSec([{ tsEpoch: NOW - RIGHT_NOW_STALE_SEC }], NOW_MS)).toBeNull();
    expect(staleReportSec([], NOW_MS)).toBeNull();
    expect(staleReportSec([{ tsEpoch: null }], NOW_MS)).toBeNull();
  });

  it('gives the newest report once it is over the stale limit', () => {
    expect(staleReportSec([{ tsEpoch: NOW - 600 }, { tsEpoch: NOW - 300 }], NOW_MS)).toBe(NOW - 300);
  });

  it('never gives a time later than the card\'s own clock: a report stamped ahead counts as now, so it is not stale', () => {
    // The review mock showed "since 1:19 PM" on a 1:15 PM card. A feed clock running ahead can't do that here.
    expect(staleReportSec([{ tsEpoch: NOW + 240 }], NOW_MS)).toBeNull();
    expect(staleReportSec([{ tsEpoch: NOW + 240 }, { tsEpoch: NOW - 600 }], NOW_MS)).toBeNull();
    for (const ts of [NOW - 121, NOW - 900, NOW - 3600]) {
      const at = staleReportSec([{ tsEpoch: ts }], NOW_MS);
      expect(at).not.toBeNull();
      expect(at!).toBeLessThanOrEqual(NOW);
    }
  });

  it('hovers with Ryan\'s words and the agency\'s clock time', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW_MS);
    render(<LiveStaleClock slug="ttc" vehicles={[{ tsEpoch: NOW - 360 }]} />);
    const text = liveLocationsUpdatedAt(agencyTime('ttc', new Date((NOW - 360) * 1000)));
    expect(text).toBe('Locations last updated at 1:09 PM');
    expect(screen.getByRole('img', { name: text }).getAttribute('title')).toBe(text);
  });

  it('is not drawn while fresh', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW_MS);
    const { container } = render(<LiveStaleClock slug="ttc" vehicles={[{ tsEpoch: NOW - 20 }]} />);
    expect(container.firstChild).toBeNull();
  });
});
