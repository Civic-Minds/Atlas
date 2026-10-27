import { describe, expect, it } from 'vitest';
import { agencyNames } from '../agencyName';

const shortenAgencyName = (name: string) => agencyNames(name).short;

describe('shortenAgencyName', () => {
  it('maps Minnesota Valley Transit Authority to MVTA, not VTA', () => {
    expect(shortenAgencyName('Minnesota Valley Transit Authority (MVTA)')).toBe('MVTA');
  });
});
