import { describe, expect, it } from 'vitest';
import { mergeUrlSearchParams, readUrlSearchNumber, readUrlSearchParam } from '../syncUrlParams';

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

describe('readUrlSearchParam / readUrlSearchNumber (the read half)', () => {
  it('reads what a sync wrote, with or without a leading ?', () => {
    const search = mergeUrlSearchParams('route=ttc::504', { vehicle: '4412', group: 'Distillery', dir: '1' });
    expect(readUrlSearchParam(search, 'vehicle')).toBe('4412');
    expect(readUrlSearchParam(`?${search}`, 'group')).toBe('Distillery');
    expect(readUrlSearchNumber(search, 'dir')).toBe(1);
  });

  it('gives null for a missing or empty param, as a sync would have deleted it', () => {
    expect(readUrlSearchParam('a=1', 'vehicle')).toBeNull();
    expect(readUrlSearchParam('vehicle=', 'vehicle')).toBeNull();
    expect(readUrlSearchNumber('dir=', 'dir')).toBeNull();
  });

  it('reads a direction number like the Live card did, and ignores one that is not a number', () => {
    expect(readUrlSearchNumber('dir=0', 'dir')).toBe(0);
    expect(readUrlSearchNumber('dir=x', 'dir')).toBeNull();
  });
});
