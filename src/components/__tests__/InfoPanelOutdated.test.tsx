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

describe('E2 new schedule, three paragraphs (CIV-1051)', () => {
  it("reads Ryan's text, with the agency's website last", () => {
    const t = render(
      <InfoPanel open onClose={() => {}} agencies={[]} helpContext={{ topic: 'new-schedule-data', agencyName: 'Grand River Transit', lastRefreshedAt: '2026-10-20', websiteUrl: 'https://www.grt.ca' }} />,
    ).container.textContent ?? '';
    expect(t).toContain("Grand River Transit's new schedule went on the map on Oct 20, 2026. It may have errors we haven't found yet.");
    expect(t).toContain("We're verifying it for missing service and other errors, and we'll correct anything we find.");
    expect(t).toContain("The agency's website has its current schedule.");
    expect(t).not.toContain('temporary');
  });
});

describe('E3 corrected data, three paragraphs (CIV-1051)', () => {
  it('shows the correction note, then what we do, then where to report', () => {
    const t = render(
      <InfoPanel open onClose={() => {}} agencies={[]} helpContext={{ topic: 'corrected-data', agencyName: 'Fred Transit', overrideNote: 'This schedule is from January 2026.' }} />,
    ).container.textContent ?? '';
    expect(t).toContain('This schedule is from January 2026.');
    expect(t).toContain('We correct errors like this before a schedule goes on the map.');
    expect(t).toContain('If something still looks wrong, report it below.');
    expect(t).not.toContain('GTFS');
  });
});

describe('E4 beta, two paragraphs (CIV-1051)', () => {
  it("reads Ryan's text with no rollout link", () => {
    const t = render(
      <InfoPanel open onClose={() => {}} agencies={[]} helpContext={{ topic: 'beta-rollout', agencyName: 'Metz' }} />,
    ).container.textContent ?? '';
    expect(t).toContain('Metz is only available on Atlas beta.');
    expect(t).toContain("We're still verifying its schedule, and some routes or times may change.");
    expect(t).not.toContain('Follow rollout');
  });
});

describe('E5 route line, three paragraphs (CIV-1051)', () => {
  it("reads Ryan's text", () => {
    const t = render(
      <InfoPanel open onClose={() => {}} agencies={[]} helpContext={{ topic: 'route-data-quality', agencyName: 'TTC' }} />,
    ).container.textContent ?? '';
    expect(t).toContain("Part of this route's line on the map may be missing or drawn in the wrong place.");
    expect(t).toContain('We still show the route. Its frequency on this card comes from the timetable and is still accurate.');
    expect(t).toContain('If something looks off, report it with the flag on this card.');
  });
});
