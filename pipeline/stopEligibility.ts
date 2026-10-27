/**
 * CIV-1011 #6: whether a stop time is a departure a rider can take, written once. A stop time with
 * pickup_type 1 only drops off (a layover a trip starts from, a terminal it ends at), so it never
 * counts as a departure: it does not pool, does not mark the stop boardable, does not grade the
 * stop and does not settle the tier (#879). Every pipeline step that asks "does this stop time
 * board" calls this.
 */
export function boardsAt(stopTime: { pickup_type?: string | null }): boolean {
  return stopTime.pickup_type?.trim() !== '1';
}
