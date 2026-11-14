import { ON_DEMAND_MODE, modeLabel } from '../../shared/modes';

/**
 * The agency card's "On-demand" pill (beta): shown for an agency whose on-demand zone is not on
 * the map yet, in the mode pills row. Selecting it shows the not-on-the-map note in the list area.
 * Local card state only. `choice` is the viewer's pick (null until they pick); without one, the
 * pill starts selected only when the agency has no routes to list.
 */
export function onDemandPillSelected(options: { hasPill: boolean; choice: boolean | null; routeCount: number }): boolean {
  if (!options.hasPill) return false;
  return options.choice ?? options.routeCount === 0;
}

/** The mode's own name, "On-demand" (Ryan, CIV-1160 question 6, 2026-11-13). */
export const ON_DEMAND_PILL_LABEL = modeLabel(ON_DEMAND_MODE);
