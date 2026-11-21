import { PEOPLE_MOVER_MODE, ROUTE_TYPE, VIRTUAL_LRT_MODE } from './rules/modes';

/**
 * The vehicle word for each mode, plural and lower case: one list for History's "No {period} {vehicles}" (N127, CIV-471)
 * and Studio Fleet's vehicle counts (CIV-2002: Ryan, "This is a train line so why does it say buses").
 */
export const MODE_VEHICLES: Record<number, string> = {
  [ROUTE_TYPE.BUS]: 'buses',
  [ROUTE_TYPE.SUBWAY]: 'trains',
  [ROUTE_TYPE.RAIL]: 'trains',
  [VIRTUAL_LRT_MODE]: 'trains',
  [ROUTE_TYPE.FERRY]: 'ferries',
  [ROUTE_TYPE.TRAM]: 'streetcars',
  [ROUTE_TYPE.TROLLEYBUS]: 'trolleybuses',
  [ROUTE_TYPE.MONORAIL]: 'monorail trains',
  [PEOPLE_MOVER_MODE]: 'people movers',
  [ROUTE_TYPE.CABLE_TRAM]: 'cable cars',
  [ROUTE_TYPE.GONDOLA]: 'gondolas',
  [ROUTE_TYPE.FUNICULAR]: 'funiculars',
};

/** The word for vehicles on a set of modes: the mode's own word when there is one mode, "vehicles" when mixed or unknown. */
export function vehiclesWord(modes: readonly number[] | undefined): string {
  const unique = [...new Set(modes ?? [])];
  return (unique.length === 1 && MODE_VEHICLES[unique[0]]) || 'vehicles';
}
