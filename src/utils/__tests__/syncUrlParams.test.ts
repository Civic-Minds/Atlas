import { describe, expect, it } from 'vitest';
import { mergeUrlSearchParams } from '../syncUrlParams';

describe('mergeUrlSearchParams', () => {
  it('sets and deletes keys without dropping siblings', () => {
    const next = mergeUrlSearchParams('day=Saturday&route=ttc::504', {
      stop: 'ttc::1234',
      day: null,
      h: '30',
    });
    const sp = new URLSearchParams(next);
    expect(sp.get('route')).toBe('ttc::504');
    expect(sp.get('stop')).toBe('ttc::1234');
    expect(sp.get('h')).toBe('30');
    expect(sp.has('day')).toBe(false);
  });

  it('accepts a leading ?', () => {
    expect(mergeUrlSearchParams('?lat=1&lon=2', { z: '12' })).toBe('lat=1&lon=2&z=12');
  });

  it('treats empty string as delete', () => {
    const next = mergeUrlSearchParams('a=1&b=2', { a: '' });
    expect(next).toBe('b=2');
  });
});
