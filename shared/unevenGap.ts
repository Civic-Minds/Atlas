/** Uneven-gap thresholds, shared by the pipeline (pipeline/headway-utils.ts) and the route card (src/utils/routeCardUneven.ts). */

// How many minutes a wait has to exceed the reported headway by before it's worth telling a
// rider about. Excess alone isn't enough: a route with a 40-min typical wait hitting 60 min once
// (a normal last-trip-of-the-night taper on plenty of real feeds) clears any reasonable minutes
// floor but is not "uneven" -- it's an ordinary infrequent route. Needs to pair with a ratio floor
// below to only fire when the wait is both a lot of extra minutes AND proportionally much longer.
export const MIN_UNSUSTAINED_EXCESS_MINUTES = 15;

// The worst gap must also be at least this multiple of the target headway. Chosen from real-feed
// data (2026-08-08), sandwiched between two hard constraints found on opposite sides:
// - Must stay BELOW ~1.82 -- issue #281 (TTC route 10 midday, gaps [315,30], median 173) is the
//   case this whole feature exists to catch, and its own ratio is only 315/173=1.82.
// - Must stay ABOVE ~1.6 -- ordinary evening wind-down on infrequent routes (Bordeaux 5: 41-min
//   median hitting a 60-min last gap, ratio 1.46; GO BR: 38 to 60, ratio 1.58) is not a real
//   problem and was getting caught by excess-only checking.
// 1.7 sits in that gap with room on both sides; the lowest-ratio real anomalies found across
// TTC/Bordeaux/GO/GCRTA at this threshold (routes 60, 927, 504, GCRTA 1) all still read as
// genuine service problems, not noise.
export const MIN_UNSUSTAINED_RATIO = 1.7;
