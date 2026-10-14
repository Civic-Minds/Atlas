import { describe, expect, it } from 'vitest';
import { withVersionParam } from '../versionedUrl';

describe('withVersionParam', () => {
  it('adds v to a plain URL', () => {
    expect(withVersionParam('https://x.test/a.json', '1')).toBe('https://x.test/a.json?v=1');
  });
  it('keeps a version a release URL already carries', () => {
    expect(withVersionParam('https://x.test/a.json?v=release-1', 'week')).toBe('https://x.test/a.json?v=release-1');
  });
  it('appends to other query parameters', () => {
    expect(withVersionParam('https://x.test/a.json?k=1', '2')).toBe('https://x.test/a.json?k=1&v=2');
  });
});
