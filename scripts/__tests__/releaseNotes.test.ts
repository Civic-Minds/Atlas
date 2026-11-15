import { describe, expect, it } from 'vitest';
import { releaseNotes, releaseTitle } from '../release-notes';

describe('GitHub release notes', () => {
  it('match the published 3.4.0 release, word for word', () => {
    expect(releaseTitle('3.4.0')).toBe('Atlas 3.4.0');
    expect(releaseNotes('3.4.0')).toBe([
      '- **Compare mode**: now on the public map on desktop and tablet, each map with its own place, day and time',
      '- **Route cards on phones**: slide up from the bottom, with the route shown above',
      '- **Agency and area pages**: every agency, metro area, state and province has its own frequency page',
      '- **Simpler route filters**: two switches hide occasional and part-time routes',
      '',
      'Full list of changes: [CHANGELOG.md](https://github.com/Civic-Minds/Atlas/blob/v3.4.0/CHANGELOG.md)',
    ].join('\n'));
  });

  it('leave beta-only items out, and refuse a version with no entry', () => {
    expect(releaseNotes('3.3.0')).not.toMatch(/Compare mode|On-demand zones/);
    expect(() => releaseNotes('9.9.9')).toThrow(/No public What's new entry/);
  });
});
