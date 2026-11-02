/**
 * The research charts show only the categories that have a count (Ryan, 2026-11-02: the Frequent story drew an empty 60 bar).
 * Every shared chart that takes a category list (RankedBars, CategorySpark, SplitBar) drops a zero by default. A chart passes
 * `keepEmpty` only where the empty category is the point, such as an axis that is a continuous scale, with a comment saying why.
 */
export function withCount<T extends { value: number }>(items: readonly T[], keepEmpty = false): readonly T[] {
  return keepEmpty ? items : items.filter(item => item.value > 0);
}
