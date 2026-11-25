import { describe, expect, it } from 'vitest';
import { LIVE_ARCHIVE_SLUGS, liveCoverage, routeIsRecorded } from '../liveCoverage';

// #1801: agencies only on the cloud recorder (YRT Viva, DRT 9XX, Brampton 5XX) are recorded, not "not recorded".
describe('cloud-recorder-only agencies count as recorded', () => {
  it('lists YRT, DRT and Brampton among the agencies Live records', () => {
    for (const slug of ['yrt', 'drt', 'brampton']) expect(LIVE_ARCHIVE_SLUGS).toContain(slug);
  });
  it('gives YRT its recorder feeds and Viva routes', () => {
    const c = liveCoverage('yrt', new Map(), '2026-11-24');
    expect(c.feeds).toEqual(['vehicle positions', 'trip updates']);
    expect(routeIsRecorded('yrt', ['601'])).toBe(true);
    expect(routeIsRecorded('yrt', ['1'])).toBe(false);
  });
});
