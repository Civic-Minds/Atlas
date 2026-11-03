/**
 * Free child fares chart (CIV-1149), counted from docs/research/free-child-fares-2026-10-11/free-child-fare-ledger.csv
 * (policy_type and free_child_age), Canada and US agencies only (Ryan: "It should be in Canada US only"; the
 * ledger's France and Mexico rows are left out). The ledger is 1.2 MB, so the counts live here and
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
  [1, 1], [2, 1], [3, 2], [4, 80], [5, 129], [6, 20], [7, 2], [8, 3], [9, 3], [10, 8], [11, 28], [12, 45], [13, 1], [14, 1], [17, 3], [18, 47],
];

/** policy_type "age" as one group, in the legend and hover readouts (Ryan's short labels, 2026-11-02). */
export const FREE_CHILD_AGE_LABEL = 'Age limit';

/** Every other policy_type, in chart order, with Ryan's short labels (2026-11-02). */
export const FREE_CHILD_OTHER_POLICIES: ReadonlyArray<{ policyType: string; label: string; agencies: number; unknown?: boolean }> = [
  { policyType: 'all-fare-free', label: 'Fare-free', agencies: 63 },
  { policyType: 'height', label: 'Height limit', agencies: 39 },
  { policyType: 'student-program', label: 'Student program', agencies: 24 },
  { policyType: 'age-conditional', label: 'Program only', agencies: 4 },
  { policyType: 'no-free-child-fare', label: 'None', agencies: 15 },
  { policyType: 'unresolved', label: 'Not found', agencies: 34, unknown: true },
];

export const freeChildAgeBars: FreeChildFareBar[] = FREE_CHILD_AGE_COUNTS.map(([age, agencies]) => ({ label: `Up to ${age}`, agencies }));
export const freeChildOtherBars: FreeChildFareBar[] = FREE_CHILD_OTHER_POLICIES.map(({ label, agencies, unknown }) => ({ label, agencies, unknown }));

/**
 * Every Canada and US agency by state or province (the ledger's region, or the agency config's when the row has none):
 * [region, agencies, [free_child_age, agencies with that age limit][]] (CIV-1282, the tile map).
 */
export const FREE_CHILD_REGIONS: ReadonlyArray<readonly [region: string, agencies: number, ages: ReadonlyArray<readonly [age: number, agencies: number]>]> = [
  ['Alabama', 4, [[5, 2]]],
  ['Alaska', 2, [[5, 1], [18, 1]]],
  ['Alberta', 6, [[4, 1], [5, 2], [12, 2]]],
  ['Arizona', 4, [[4, 1]]],
  ['Arkansas', 2, [[4, 1], [7, 1]]],
  ['British Columbia', 14, [[4, 1], [12, 13]]],
  ['California', 98, [[4, 23], [5, 21], [6, 2], [7, 1], [11, 2], [12, 2], [18, 14]]],
  ['Colorado', 22, [[4, 1], [5, 2], [10, 2], [18, 2]]],
  ['Connecticut', 2, [[4, 1]]],
  ['Delaware', 1, []],
  ['Florida', 21, [[4, 2], [5, 4], [6, 5], [8, 2], [18, 1]]],
  ['Georgia', 10, [[5, 3], [6, 1]]],
  ['Hawaii', 3, [[5, 1], [6, 1]]],
  ['Idaho', 3, [[5, 1], [18, 1]]],
  ['Illinois', 10, [[4, 2], [5, 3], [6, 3]]],
  ['Indiana', 7, [[4, 3], [5, 3]]],
  ['Iowa', 12, [[4, 3], [5, 2], [8, 1], [12, 1], [17, 1], [18, 1]]],
  ['Kansas', 3, [[4, 1], [5, 1]]],
  ['Kentucky', 3, [[5, 1], [6, 1]]],
  ['Louisiana', 7, [[2, 1], [4, 1], [5, 2]]],
  ['Maine', 3, [[5, 3]]],
  ['Manitoba', 2, [[11, 1], [17, 1]]],
  ['Maryland', 5, [[5, 2], [12, 1]]],
  ['Massachusetts', 4, [[11, 1]]],
  ['Michigan', 14, [[1, 1], [5, 4]]],
  ['Minnesota', 3, [[4, 1], [5, 2]]],
  ['Mississippi', 3, [[5, 1]]],
  ['Missouri', 4, [[4, 2], [5, 2]]],
  ['Montana', 3, [[5, 1]]],
  ['Nebraska', 2, [[4, 1]]],
  ['Nevada', 2, [[5, 2]]],
  ['New Brunswick', 3, [[5, 1], [6, 1], [11, 1]]],
  ['New Hampshire', 2, [[4, 1]]],
  ['New Jersey', 4, [[4, 3], [5, 1]]],
  ['New Mexico', 6, [[4, 1], [18, 1]]],
  ['New York', 30, [[4, 6], [5, 5], [9, 1]]],
  ['Newfoundland', 1, [[11, 1]]],
  ['North Carolina', 17, [[4, 3], [5, 6], [12, 1]]],
  ['North Dakota', 3, [[5, 1]]],
  ['Northwest Territories', 1, [[12, 1]]],
  ['Nova Scotia', 1, [[12, 1]]],
  ['Ohio', 14, [[4, 1], [5, 6], [10, 1], [11, 1], [12, 2]]],
  ['Oklahoma', 2, [[18, 1]]],
  ['Ontario', 35, [[4, 3], [5, 8], [6, 2], [10, 1], [12, 18], [14, 1]]],
  ['Oregon', 15, [[4, 1], [5, 2], [6, 3], [9, 1], [10, 1], [18, 3]]],
  ['Pennsylvania', 20, [[4, 2], [5, 7], [6, 1], [11, 4]]],
  ['Prince Edward Island', 1, []],
  ['Quebec', 19, [[11, 16], [12, 2]]],
  ['Rhode Island', 1, [[4, 1]]],
  ['Saskatchewan', 4, [[5, 1], [9, 1], [13, 1]]],
  ['South Carolina', 5, [[5, 2]]],
  ['South Dakota', 2, [[18, 2]]],
  ['Tennessee', 5, [[3, 1], [4, 1], [5, 2]]],
  ['Texas', 20, [[4, 3], [5, 12]]],
  ['Utah', 2, [[5, 2]]],
  ['Vermont', 2, [[5, 1], [10, 1]]],
  ['Virginia', 17, [[3, 1], [4, 1], [5, 2], [10, 1], [11, 1], [12, 1], [17, 1], [18, 1]]],
  ['Washington', 24, [[10, 1], [18, 19]]],
  ['Washington DC', 2, [[4, 1]]],
  ['West Virginia', 2, [[5, 1]]],
  ['Wisconsin', 11, [[4, 6], [5, 2]]],
  ['Wyoming', 2, [[5, 1]]],
  ['Yukon', 1, [[4, 1]]],
];

/** Agencies in the chart by country (the Sample line in "Method"). */
export const FREE_CHILD_AGENCIES_BY_COUNTRY = { 'United States': 465, Canada: 88 } as const;

const sum = (bars: FreeChildFareBar[]) => bars.reduce((total, bar) => total + bar.agencies, 0);

export const freeChildFareStats = {
  agencies: sum(freeChildAgeBars) + sum(freeChildOtherBars),
  freeUpToAge: sum(freeChildAgeBars),
  notFound: FREE_CHILD_OTHER_POLICIES.find(p => p.policyType === 'unresolved')!.agencies,
};
