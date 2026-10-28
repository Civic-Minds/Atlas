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
