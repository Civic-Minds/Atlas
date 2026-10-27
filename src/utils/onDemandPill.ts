/**
 * The agency card's "On-Demand" pill (beta): shown for an agency whose on-demand zone is not on
 * the map yet, in the mode pills row. Selecting it shows the not-on-the-map note in the list area.
 * Local card state only. `choice` is the viewer's pick (null until they pick); without one, the
 * pill starts selected only when the agency has no routes to list.
 */
export function onDemandPillSelected(options: { hasPill: boolean; choice: boolean | null; routeCount: number }): boolean {
  if (!options.hasPill) return false;
  return options.choice ?? options.routeCount === 0;
}

export const ON_DEMAND_PILL_LABEL = 'On-Demand';
