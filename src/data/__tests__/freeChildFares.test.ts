import { readFileSync } from 'node:fs';
import Papa from 'papaparse';
import { describe, expect, it } from 'vitest';
import { FREE_CHILD_AGE_COUNTS, FREE_CHILD_OTHER_POLICIES, freeChildFareStats } from '../freeChildFares';

const ledger = Papa.parse<Record<string, string>>(readFileSync('docs/research/free-child-fares-2026-10-11/free-child-fare-ledger.csv', 'utf8'), { header: true, skipEmptyLines: true }).data;

describe('free child fares chart counts (CIV-1149)', () => {
  it('match the ledger: ages by free_child_age, every other policy_type by itself', () => {
    const ages = new Map<number, number>();
    const policies = new Map<string, number>();
    for (const row of ledger) {
      if (row.policy_type === 'age') ages.set(Number(row.free_child_age), (ages.get(Number(row.free_child_age)) ?? 0) + 1);
      else policies.set(row.policy_type, (policies.get(row.policy_type) ?? 0) + 1);
    }
    expect(FREE_CHILD_AGE_COUNTS).toEqual([...ages.entries()].sort((a, b) => a[0] - b[0]));
    expect(Object.fromEntries(FREE_CHILD_OTHER_POLICIES.map(p => [p.policyType, p.agencies]))).toEqual(Object.fromEntries(policies));
    expect(freeChildFareStats.agencies).toBe(ledger.length);
  });

  it('keeps the heading true: age 5 is the most common cutoff', () => {
    const [topAge] = [...FREE_CHILD_AGE_COUNTS].sort((a, b) => b[1] - a[1])[0];
    expect(topAge).toBe(5);
    expect(freeChildFareStats).toMatchObject({ agencies: 697, freeUpToAge: 487, notFound: 41 });
  });
});
