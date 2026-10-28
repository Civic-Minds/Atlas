// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import InfoPanel from '../InfoPanel';

const text = (ctx: Record<string, unknown>) => render(
  <InfoPanel open onClose={() => {}} agencies={[]} helpContext={{ topic: 'outdated-schedule', agencyName: 'Grand River Transit', expDateStr: 'Apr 26, 2026', expiredFeedCheckCount: 4, expiredFeedCheckSince: '2026-09-01', lastFeedCheckAt: '2026-10-26', ...ctx }} />,
).container.textContent ?? '';

describe('E1 outdated schedule, three paragraphs (CIV-1051)', () => {
  it('N2: the issue, the weekly check with its history, then the website', () => {
    const t = text({});
    expect(t).toContain("Grand River Transit's timetable ended on Apr 26, 2026. Times shown may be out of date. This is the latest schedule the agency has published that we could verify.");
    expect(t).toContain("We check for new schedules every week. We've checked for a new timetable 4 times since Sep 1, 2026, with our most recent check on Oct 26, 2026.");
    expect(t).toContain("A newer schedule may be on the agency's website.");
    expect(t).not.toContain('We check all feeds weekly');
  });

  it('N3: kept by hand, N76 takes the weekly check\'s place', () => {
    const t = text({ manualFeedSource: true });
    expect(t).toContain("This agency doesn't publish a feed we can check automatically. We update it when a newer file is provided and verified.");
    expect(t).not.toContain('We check for new schedules every week');
  });
});
