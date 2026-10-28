/**
 * Processing does its calendar math in local time (transit-calendar.ts, parseGtfs.ts,
 * process-core.ts: YYYYMMDD dates built with `new Date(y, m, d)`, the run date, day-of-week, and
 * midpoints and 24-hour steps that cross a DST change), so its output depended on the machine's
 * time zone: on a UTC runner MBTA 9 read span instead of every 14 (#923). Every run is pinned to
 * the zone the data was reviewed in, whatever the machine's, by setting it before any of that code
 * reads a date. Node applies a changed process.env.TZ to later Date calls.
 */
export const PIPELINE_TIME_ZONE = 'America/Toronto';

process.env.TZ = PIPELINE_TIME_ZONE;

/**
 * #1135: the run date as YYYYMMDD in the pipeline's zone, whatever the machine's. History's writer and backfill used the
 * UTC date (`toISOString()`), a day ahead of the map's run date every evening in Eastern time.
 */
export function pipelineRunDateYmd(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: PIPELINE_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = (type: string) => parts.find(p => p.type === type)!.value;
  return `${get('year')}${get('month')}${get('day')}`;
}
