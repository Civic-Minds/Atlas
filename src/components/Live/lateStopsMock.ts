/**
 * CIV-1405 mock-up switches, for the review page only: how many rows the "Stops most often late" table shows beside
 * its map. The map always shows up to LATE_MAP_STOPS. Remove this file once Ryan has picked the number.
 */
export const LATE_MAP_STOPS = 20;
export const LATE_TABLE_STOPS = 10;

/** `?lateTable=20` grows the table to the map's stops; anything else keeps LATE_TABLE_STOPS rows. */
export function lateTableRows(search: string = typeof window === 'undefined' ? '' : window.location.search): number {
  return new URLSearchParams(search).get('lateTable') === '20' ? LATE_MAP_STOPS : LATE_TABLE_STOPS;
}

/** The caption line for a map that shows more stops than the table lists, or undefined when they match. */
export function lateMapNote(tableRows: number, mapDots: number): string | undefined {
  return mapDots > tableRows ? `Dots ${tableRows + 1} to ${mapDots} are the next most often late.` : undefined;
}
