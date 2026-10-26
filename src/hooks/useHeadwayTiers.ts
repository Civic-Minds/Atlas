import { getHeadwayTiers } from '../utils/colors';
import { useColorMode } from './useColorMode';

/** The frequency tiers (limit, colour, label) in the palette for the person's colour-vision setting. Every legend reads this, so a legend never disagrees with the map. */
export function useHeadwayTiers() {
  return getHeadwayTiers(useColorMode());
}
