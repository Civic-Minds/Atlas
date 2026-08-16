import { describe, expect, it } from 'vitest';
import { isNewerBuild } from '../appUpdate';

describe('isNewerBuild', () => {
  it('detects a different published build', () => {
    expect(isNewerBuild('old-sha', 'new-sha')).toBe(true);
  });

  it('does not report a match or an unavailable build as newer', () => {
    expect(isNewerBuild('same-sha', 'same-sha')).toBe(false);
    expect(isNewerBuild('local', null)).toBe(false);
    expect(isNewerBuild('', 'new-sha')).toBe(false);
  });
});
