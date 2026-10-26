import { describe, expect, it } from 'vitest';
import { chooserReportDetails } from '../panels/DisambiguationPanel';

describe('route chooser report (CIV-932)', () => {
  it('lists every route the chooser shows, with its key, then the link', () => {
    const details = chooserReportDetails([
      { key: 'ttc::504', shortName: '504', longName: 'King', agencyName: 'TTC', agencySlug: 'ttc', color: '#000' },
      { key: 'ttc::503', shortName: '503', longName: 'Kingston Rd', agencyName: 'TTC', agencySlug: 'ttc', color: '#000' },
    ]);
    expect(details).toContain('- TTC: 504 — King (ttc::504)');
    expect(details).toContain('- TTC: 503 — Kingston Rd (ttc::503)');
    expect(details).toMatch(/\*\*Atlas URL:\*\* /);
  });
});
