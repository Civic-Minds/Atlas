import { describe, expect, it } from 'vitest';
import { agencyPagesFreshness, REGENERATE_HELP } from '../agencyPagesFreshness';

describe('agency page summaries freshness (#1156)', () => {
  it('is current when the summaries come from the release the site serves', () => {
    expect(agencyPagesFreshness('release-mvp929b3', 'release-mvp929b3').status).toBe('current');
  });

  it('is behind when the site serves a newer release, and names both', () => {
    const r = agencyPagesFreshness('release-mvislmj9', 'release-mvp929b3');
    expect(r.status).toBe('behind');
    expect(r.message).toContain('release-mvislmj9');
    expect(r.message).toContain('release-mvp929b3');
  });

  it('is unknown, not behind, when either side is missing (offline CI never warns falsely)', () => {
    expect(agencyPagesFreshness('release-a', null).status).toBe('unknown');
    expect(agencyPagesFreshness(undefined, 'release-a').status).toBe('unknown');
  });

  it('tells how to regenerate', () => {
    expect(REGENERATE_HELP).toContain('scripts/build-agency-page-summaries.ts');
    expect(REGENERATE_HELP).toContain('agency-pages.json');
  });
});
