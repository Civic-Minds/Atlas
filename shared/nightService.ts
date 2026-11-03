/** The Night Service grades (CIV-1329): every 30, 60 or 90 minutes or better, 2 to 5 AM. 90 is the cutoff for running through the night (#1322). */
export type NightServiceFrequency = 30 | 60 | 90;

export const NIGHT_SERVICE_FREQUENCIES: readonly NightServiceFrequency[] = [30, 60, 90];

export function nightServiceKey(frequency: NightServiceFrequency): 'nightService30' | 'nightService60' | 'nightService90' {
  return `nightService${frequency}` as 'nightService30' | 'nightService60' | 'nightService90';
}

type NightFlags = { nightService30?: unknown; nightService60?: unknown; nightService90?: unknown; nightService?: unknown };

/**
 * A row's best night grade, or null when it does not run through the night. The grades come from one verdict
 * (pipeline/tripSets.ts directionNightVerdict at 30, 60 and 90, or hasNightServiceAtShapeEndpoints for rows without
 * stretches), so a row at 30 is also at 60 and 90. nightService is the older 60.
 */
export function rowNightGrade(row: NightFlags | null | undefined): NightServiceFrequency | null {
  if (row?.nightService30 === true) return 30;
  if (row?.nightService60 === true || row?.nightService === true) return 60;
  if (row?.nightService90 === true) return 90;
  return null;
}

/** The row passes the Night Service check at `frequency` (each grade includes the stricter ones). */
export function rowPassesNightGrade(row: NightFlags | null | undefined, frequency: NightServiceFrequency): boolean {
  const grade = rowNightGrade(row);
  return grade != null && grade <= frequency;
}

/**
 * A route's night value for a list (CIV-931): the grade the Night view checks over 2am to 5am, never a
 * daytime headway. The loosest grade of its lit rows, so a list never overstates it: one row at 60 makes
 * the route 60, one at 90 makes it 90.
 */
export function routeNightGrade(rows: ReadonlyArray<NightFlags>): NightServiceFrequency {
  const grades = rows.map(rowNightGrade);
  if (grades.length > 0 && grades.every(g => g === 30)) return 30;
  return grades.some(g => g === 90) ? 90 : 60;
}

/**
 * #1322 (Ryan, 2026-11-03: "Use 90 minutes as the cutoff everywhere"): the one night test. A row runs through the
 * night when it passes the Night Service check at its loosest grade, 90 (2am to 5am, no gap between buses over 90
 * minutes, from the night verdict); 30 and 60 are display tiers within it. The Night Service page lists exactly
 * these rows (pipeline/nightServiceIndex.ts), and the Overnight period reads the same test (tileNightServiceExpr is
 * its tile twin), so a first trip at 3 AM is never overnight service.
 */
export function rowRunsThroughNight(row: NightFlags | null | undefined): boolean {
  return rowNightGrade(row) != null;
}

/** MapLibre twin of rowRunsThroughNight, for tile filters (shared/tileFilterExprs.ts). */
export function tileNightServiceExpr(): unknown[] {
  return ['any',
    ['==', ['get', 'nightService30'], true],
    ['==', ['get', 'nightService60'], true],
    ['==', ['get', 'nightService90'], true],
    ['==', ['get', 'nightService'], true],
  ];
}
