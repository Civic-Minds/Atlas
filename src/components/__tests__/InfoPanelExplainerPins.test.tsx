// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import InfoPanel, { type HelpContext } from '../InfoPanel';

/** The panel's paragraphs and link labels, in order: what a reader sees. */
function panel(ctx: HelpContext) {
  const { container } = render(<InfoPanel open onClose={() => {}} agencies={[]} helpContext={ctx} />);
  const paragraphs = [...container.querySelectorAll('p')].map(p => p.textContent ?? '');
  const links = [...container.querySelectorAll('a')].map(a => (a.textContent ?? '').trim()).filter(Boolean);
  return { paragraphs, links };
}

const checks = { expiredFeedCheckCount: 4, expiredFeedCheckSince: '2026-09-01', lastFeedCheckAt: '2026-10-26' };
const site = 'https://www.example.org';

// CIV-1061: the approved E1–E8 text (CIV-1051), word for word. The pieces refactor must not change a character.
describe('explainer text is pinned (CIV-1061)', () => {
  it('E1, N2', () => {
    expect(panel({ topic: 'outdated-schedule', agencyName: 'Grand River Transit', expDateStr: 'Apr 26, 2026', websiteUrl: site, ...checks })).toMatchSnapshot();
  });
  it('E1, N2 with no check count', () => {
    expect(panel({ topic: 'outdated-schedule', agencyName: 'Grand River Transit', expDateStr: 'Apr 26, 2026', lastRefreshedAt: '2026-10-20' })).toMatchSnapshot();
  });
  it('E1, N3 (kept by hand)', () => {
    expect(panel({ topic: 'outdated-schedule', agencyName: 'Grand River Transit', expDateStr: 'Apr 26, 2026', manualFeedSource: true, websiteUrl: site })).toMatchSnapshot();
  });
  it('E2', () => {
    expect(panel({ topic: 'new-schedule-data', agencyName: 'Grand River Transit', lastRefreshedAt: '2026-10-20', websiteUrl: site })).toMatchSnapshot();
  });
  it('E3', () => {
    expect(panel({ topic: 'corrected-data', agencyName: 'Fred Transit', overrideNote: 'This schedule is from January 2026.', issueUrl: 'https://github.com/Civic-Minds/Atlas/issues/123' })).toMatchSnapshot();
  });
  it('E4', () => {
    expect(panel({ topic: 'beta-rollout', agencyName: 'Metz' })).toMatchSnapshot();
  });
  it('E5', () => {
    expect(panel({ topic: 'route-data-quality', agencyName: 'TTC' })).toMatchSnapshot();
  });
  it('E6', () => {
    expect(panel({ topic: 'no-route-shape' })).toMatchSnapshot();
  });
  it('E7', () => {
    expect(panel({ topic: 'edge-gap-allowance' })).toMatchSnapshot();
  });
  it('E8', () => {
    expect(panel({ topic: 'weekday-variation', websiteUrl: site })).toMatchSnapshot();
  });
});
