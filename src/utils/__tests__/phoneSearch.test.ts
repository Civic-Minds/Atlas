import { describe, expect, it } from 'vitest';
import { phoneSearchExpanded, phoneSearchOpenAfterBlur } from '../format';

describe('phone search expand and collapse', () => {
  it('is an icon until tapped or focused, and never expands on wide screens', () => {
    expect(phoneSearchExpanded(true, false, false)).toBe(false);
    expect(phoneSearchExpanded(true, false, true)).toBe(true);
    expect(phoneSearchExpanded(true, true, false)).toBe(true);
    expect(phoneSearchExpanded(false, true, true)).toBe(false);
  });

  it('folds back on blur only when the query is empty', () => {
    expect(phoneSearchOpenAfterBlur(true, '')).toBe(false);
    expect(phoneSearchOpenAfterBlur(true, '  ')).toBe(false);
    expect(phoneSearchOpenAfterBlur(true, 'king')).toBe(true);
    expect(phoneSearchOpenAfterBlur(false, 'king')).toBe(false);
  });
});
