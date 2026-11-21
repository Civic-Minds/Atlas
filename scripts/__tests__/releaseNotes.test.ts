import { describe, expect, it } from 'vitest';
import { releaseNotes, releaseTitle } from '../release-notes';

describe('GitHub release notes', () => {
  // The published 3.4.0 notes said "now on the public map on desktop and tablet…"; Ryan reworded the public line as a launch (CIV-1999).
  it('build the 3.4.0 notes from the public What\'s new lines', () => {
    expect(releaseTitle('3.4.0')).toBe('Atlas 3.4.0');
    expect(releaseNotes('3.4.0')).toBe([
      '- **Compare mode**: put two maps side by side, each with its own place, day and time',
      '- **Route cards on phones**: slide up from the bottom, with the route shown above',
      '- **Agency and area pages**: agencies, metro areas, states and provinces have their own frequency pages',
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
