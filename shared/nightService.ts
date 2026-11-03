export type NightServiceFrequency = 30 | 60;

export function nightServiceKey(frequency: NightServiceFrequency): 'nightService30' | 'nightService60' {
  return `nightService${frequency}` as 'nightService30' | 'nightService60';
}

/**
 * A route's night value for a list (CIV-931): the grade the Night view checks over 2am to 5am, never a
 * daytime headway. 30 only when every lit row of the route has the 30 grade; one row at 60 makes the
 * route 60, so a list never overstates it.
 */
export function routeNightGrade(rows: ReadonlyArray<{ nightService30?: boolean | null }>): NightServiceFrequency {
  return rows.length > 0 && rows.every(row => row.nightService30 === true) ? 30 : 60;
}

/**
 * #1322 (Ryan, 2026-11-03): the one night test. A row runs through the night when it passes the Night Service
 * check (2am to 5am, every 60 minutes or better, from the night verdict); the 30 grade implies it, and
 * nightService is the older 60. The Night Service page lists exactly these rows (pipeline/nightServiceIndex.ts,
 * src/utils/nightRoutesInView.ts), and the Overnight period reads the same test (tileNightServiceExpr is its tile
 * twin), so a first trip at 3 AM is never overnight service.
 */
export function rowRunsThroughNight(row: { nightService30?: unknown; nightService60?: unknown; nightService?: unknown } | null | undefined): boolean {
  return row?.nightService30 === true || row?.nightService60 === true || row?.nightService === true;
}

/** MapLibre twin of rowRunsThroughNight, for tile filters (shared/tileFilterExprs.ts). */
export function tileNightServiceExpr(): unknown[] {
  return ['any',
    ['==', ['get', 'nightService30'], true],
    ['==', ['get', 'nightService60'], true],
    ['==', ['get', 'nightService'], true],
  ];
}
