import { render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import History, { type AgencyHistory } from '../History';
import { HistoryMapOverlayProvider } from '../../context/HistoryMapOverlay';
import type { HistoryView } from '../../utils/historyYearMap';

// CIV-1425: History's Saturday and Sunday read only the day's own stored values by time of day.
const snap = (year: number, weekday: number, sat: Record<string, unknown> | undefined, trunk?: number) => ({
  label: `Jun ${year}`, year, weekdayHeadwayMin: weekday,
  headwayByPeriod: { midday: weekday },
  ...(trunk ? { trunkHeadwayByPeriod: { midday: trunk } } : {}),
  v2: { refDate: `${year}0601`, key: 'k', rep: { h: weekday, p: { midday: weekday }, ...(trunk ? { tp: { midday: trunk } } : {}) }, ...(sat ? { sat } : {}) },
});

const pilot = {
  slug: 'mbta', name: 'MBTA', region: 'Massachusetts', center: [-71.06, 42.36],
  routes: [
    {
      routeShortName: '1', routeName: 'Alpha',
      tripDuration: { firstLabel: 'Jun 2015', firstMinutes: 40, lastLabel: 'Jun 2024', lastMinutes: 50 },
      snapshots: [
        snap(2015, 52, { h: 30, p: { midday: 20 }, tp: { midday: 12 } }, 15),
        snap(2019, 60, { h: 30, p: { midday: 24 } }, 15),
        snap(2024, 12, { h: 30, p: { midday: 30 } }),
      ],
    },
    { routeShortName: 'N', routeName: 'Nightless', snapshots: [snap(2015, 30, { none: true }), snap(2019, 30, { none: true }), snap(2024, 30, { none: true })] },
  ],
} as unknown as AgencyHistory;

const other = {
  slug: 'other', name: 'Other', region: 'Ontario', center: [-79.4, 43.7],
  routes: [{ routeShortName: '5', routeName: 'Fifth', snapshots: [snap(2015, 20, { h: 30 }), snap(2019, 20, { h: 30 }), snap(2024, 20, { h: 30 })] }],
} as unknown as AgencyHistory;

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});

async function open(path: string, agency: AgencyHistory, view: HistoryView, waitFor_: string) {
  window.history.replaceState(null, '', path);
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => [agency, ...[pilot, other].filter(a => a !== agency)] })));
  const { container } = render(<HistoryMapOverlayProvider><History active view={view} query="" searchFocused={false} setQuery={() => {}} /></HistoryMapOverlayProvider>);
  await waitFor(() => expect(container.textContent).toContain(waitFor_));
  return container;
}

const saturday: HistoryView = { period: 'midday', maxHeadway: Infinity, day: 'Saturday' };
const weekday: HistoryView = { period: 'midday', maxHeadway: Infinity, day: 'Weekday' };

describe('History on Saturday (CIV-1425)', () => {
  it("route card rows, chart and box read Saturday's values by time of day, with Saturday's own shared-stretch range and no trip time", async () => {
    const c = await open('/apps/history?agency=mbta&hroute=1&year=2024&p=midday', pilot, saturday, 'Jun 2015');
    const text = c.textContent ?? '';
    // CIV-1431: the 2015 Saturday stores its own shared stretch (12 at midday), so its row reads as a range,
    // and never the weekday's (15–52); 2019's Saturday stores none, so it stays a plain value.
    expect(text).toContain('every 12–20 min');
    expect(text).toContain('every 24 min');
    expect(text).toContain('every 30 min');
    expect(text).not.toContain('every 15–52 min');
    expect(text).not.toContain('every 15–24 min');
    expect(text).not.toContain('every 52 min');
    expect(c.querySelector('svg path')).not.toBeNull();
    expect(c.querySelector('[data-testid="history-frequency"]')?.textContent).toBe('Frequency: 20 → 30 min');
    expect(c.querySelector('[data-testid="history-frequency-box"]')?.textContent).toContain('This compares the oldest and newest Saturday schedules available for this route.');
    expect(c.querySelector('[data-testid="history-trip-time-box"]')).toBeNull();
  });

  it('a Saturday with no trips reads "no trips" on the route card', async () => {
    const c = await open('/apps/history?agency=mbta&hroute=N&year=2024&p=midday', pilot, saturday, 'Jun 2015');
    expect(c.textContent).toContain('no trips');
  });

  it('the agency list reads Saturday values, "no trips" rows, and no missing-values notice for a pilot agency', async () => {
    // Waits for a row, not the list heading: the rows can render a moment after it (CI, PR #1457).
    const c = await open('/apps/history?agency=mbta&year=2024&p=midday', pilot, saturday, 'Nightless');
    const text = c.textContent ?? '';
    expect(text).toContain('Biggest changes first');
    expect(text).toContain('no trips');
    expect(text).toContain('30 min');
    expect(text).toContain('+6');
    expect(text).not.toContain('12 min');
    expect(text).not.toContain('values by time of day');
  });

  it('a frequency limit leaves out "no trips" routes', async () => {
    // Waits for the row that stays, not the list heading (it can render first; failed in CI on PR #1457).
    const c = await open('/apps/history?agency=mbta&year=2024&p=midday', pilot, { ...saturday, maxHeadway: 60 }, 'Alpha');
    expect(c.textContent).toContain('Biggest changes first');
    expect(c.textContent).not.toContain('Nightless');
  });

  it('an agency with no Saturday values by time of day says so once', async () => {
    const c = await open('/apps/history?agency=other&year=2024&p=midday', other, saturday, 'Biggest changes first');
    expect(c.textContent).toContain("Saturday values by time of day aren't available for this agency yet.");
  });
});

describe('History on Weekday stays as it was (CIV-1425)', () => {
  it('keeps the weekday rows, shared-stretch range, box sentence and trip time', async () => {
    const c = await open('/apps/history?agency=mbta&hroute=1&year=2024&p=midday', pilot, weekday, 'Jun 2015');
    const text = c.textContent ?? '';
    expect(text).toContain('every 15–52 min');
    expect(text).not.toContain('no trips');
    expect(c.querySelector('[data-testid="history-frequency-box"]')?.textContent).toContain('This compares the oldest and newest weekday schedules available for this route.');
    expect(c.querySelector('[data-testid="history-trip-time-box"]')).not.toBeNull();
  });

  it('shows no weekend notice on the agency list', async () => {
    const c = await open('/apps/history?agency=other&year=2024&p=midday', other, weekday, 'Biggest changes first');
    expect(c.textContent).not.toContain('values by time of day');
  });
});
