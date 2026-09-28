/** Higher priority draws later, keeping the most frequent lines visible at overlaps. */
export function buildRouteSortKeyExpression(headwayExpr: unknown): unknown[] {
  return ['case',
    ['<=', headwayExpr, 10], 4,
    ['<=', headwayExpr, 15], 3,
    ['<=', headwayExpr, 30], 2,
    ['<=', headwayExpr, 60], 1,
    0,
  ];
}
