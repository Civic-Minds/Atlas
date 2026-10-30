/**
 * Free child fares chart (CIV-1149), counted from docs/research/free-child-fares-2026-10-11/free-child-fare-ledger.csv
 * (policy_type and free_child_age). The ledger is 1.2 MB, so the counts live here and
 * src/data/__tests__/freeChildFares.test.ts recounts them from the CSV.
 */

export interface FreeChildFareBar {
  label: string;
  agencies: number;
  /** No current official rule was found: drawn hatched. */
  unknown?: boolean;
}

/** policy_type "age", by free_child_age: the oldest age that rides free. */
export const FREE_CHILD_AGE_COUNTS: ReadonlyArray<readonly [age: number, agencies: number]> = [
  [1, 2], [2, 6], [3, 47], [4, 100], [5, 156], [6, 22], [7, 3], [8, 3], [9, 4], [10, 15], [11, 31], [12, 45], [13, 1], [14, 1], [17, 4], [18, 47],
];

/** Every other policy_type, in chart order. */
export const FREE_CHILD_OTHER_POLICIES: ReadonlyArray<{ policyType: string; label: string; agencies: number; unknown?: boolean }> = [
  { policyType: 'all-fare-free', label: 'Free for everyone', agencies: 83 },
  { policyType: 'height', label: 'Free below a height', agencies: 39 },
  { policyType: 'student-program', label: 'Through a student program', agencies: 26 },
  { policyType: 'age-conditional', label: 'Only under a program', agencies: 5 },
  { policyType: 'no-free-child-fare', label: 'No free child fare', agencies: 16 },
  { policyType: 'unresolved', label: 'Not found yet', agencies: 41, unknown: true },
];

export const freeChildAgeBars: FreeChildFareBar[] = FREE_CHILD_AGE_COUNTS.map(([age, agencies]) => ({ label: `Up to ${age}`, agencies }));
export const freeChildOtherBars: FreeChildFareBar[] = FREE_CHILD_OTHER_POLICIES.map(({ label, agencies, unknown }) => ({ label, agencies, unknown }));

const sum = (bars: FreeChildFareBar[]) => bars.reduce((total, bar) => total + bar.agencies, 0);

export const freeChildFareStats = {
  agencies: sum(freeChildAgeBars) + sum(freeChildOtherBars),
  freeUpToAge: sum(freeChildAgeBars),
  notFound: FREE_CHILD_OTHER_POLICIES.find(p => p.policyType === 'unresolved')!.agencies,
  maxBar: Math.max(...freeChildAgeBars.map(b => b.agencies), ...freeChildOtherBars.map(b => b.agencies)),
};
