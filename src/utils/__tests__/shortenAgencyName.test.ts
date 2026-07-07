import { describe, expect, it } from 'vitest';
import { shortenAgencyName } from '../format';

describe('shortenAgencyName', () => {
  it('maps Minnesota Valley Transit Authority to MVTA, not VTA', () => {
    expect(shortenAgencyName('Minnesota Valley Transit Authority (MVTA)')).toBe('MVTA');
  });
});
