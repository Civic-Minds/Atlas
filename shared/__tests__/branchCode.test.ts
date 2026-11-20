import { describe, expect, it } from 'vitest';
import { branchBase, branchCodeOf, headsignBranchCode } from '../branchCode';
import { buildRouteCardModel, rowBranchCode, withBranchCode } from '../../src/utils/routeCardRows';

describe('branch IDs the data names (CIV-1456)', () => {
  it('takes a route number plus one branch letter, never an express, limited, rapid or direction letter', () => {
    expect(branchCodeOf('52A', '52')).toBe('52A');
    expect(branchCodeOf('41G', '41')).toBe('41G');
    expect(branchCodeOf('14R', '14')).toBeNull();
    expect(branchCodeOf('440S', '440')).toBeNull();
    expect(branchCodeOf('41', '41')).toBeNull();
    expect(branchCodeOf('152A', '52')).toBeNull();
    expect(branchCodeOf(null, '52')).toBeNull();
  });

  it('finds the base of a lettered short name', () => {
    expect(branchBase('10A')).toBe('10');
    expect(branchBase('10')).toBe('10');
    expect(branchBase('14R')).toBe('14R');
  });

  it('reads the code a TTC headsign leads with, and none from a base trip', () => {
    expect(headsignBranchCode('West - 52A Lawrence West towards Pearson Airport via Dixon Rd', '52')).toBe('52A');
    expect(headsignBranchCode('South - 110C Islington South towards Kipling Station', '110')).toBe('110C');
    expect(headsignBranchCode('East - 52 Lawrence West towards Lawrence Station', '52')).toBeNull();
    expect(headsignBranchCode('Pickering GO', '41')).toBeNull();
  });

  it('labels a card row with its code from processing, the route_variant or a lettered short name, once', () => {
    expect(rowBranchCode({ branchCode: '52A', routeVariant: null, routeShortName: '52' }, '52')).toBe('52A');
    expect(rowBranchCode({ routeVariant: '41G', routeShortName: '41' }, '41')).toBe('41G');
    expect(rowBranchCode({ routeVariant: '41', routeShortName: '41' }, '41')).toBeNull();
    expect(rowBranchCode({ routeShortName: '10B' }, '10')).toBe('10B');
    expect(withBranchCode('to Pearson Airport', '52A')).toBe('52A · to Pearson Airport');
    expect(withBranchCode('41A · Pickering GO', '41A')).toBe('41A · Pickering GO');
    expect(withBranchCode('to Lawrence Station', null)).toBe('to Lawrence Station');
  });
});
