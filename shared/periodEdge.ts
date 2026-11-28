/**
 * CIV-3186: a period's edge, the one type every card, list, agency page, Studio comparison and pipeline file carries. A late
 * start (`from`) or early end (`until`), in minutes after midnight, and the spacing where the period runs (`every`).
 */
export interface PeriodEdge {
  from?: number;
  until?: number;
  every: number;
  /** CIV-1913: the longest wait after `until` when the period slows down rather than ends ("every 15 until 8:57 PM, then every 30"). */
  then?: number;
  /** #1724: the one long wait after `until` that `then` leaves out ("then every 25 min, with one 37 min gap"). */
  thenGap?: number;
  /**
   * CIV-3135 (Ryan, 2026-11-28, "1"): a slow start's longest wait before `from` (the period's value), so the card reads
   * "every 32 min, then every 17 from 4:37 PM" and a plain "from" only ever means the first bus.
   */
  before?: number;
}

/**
 * The one field-by-field copy of an edge: each field it has, none it lacks (no `key: undefined` in written files), and nothing
 * else it carries (a stretch index, partOfRoute). A new edge field is added here and in PeriodEdge, nowhere else.
 */
export function copyPeriodEdge(e: PeriodEdge): PeriodEdge {
  return {
    ...(e.from != null ? { from: e.from } : {}),
    ...(e.until != null ? { until: e.until } : {}),
    every: e.every,
    ...(e.then != null ? { then: e.then } : {}),
    ...(e.thenGap != null ? { thenGap: e.thenGap } : {}),
    ...(e.before != null ? { before: e.before } : {}),
  };
}
