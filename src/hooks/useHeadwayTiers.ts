import { getHeadwayTiers } from '../utils/colors';
import { useColorVision } from '../context/ColorVisionContext';

/** The frequency tiers (limit, colour, label) in the palette for the person's colour-vision setting. Every legend reads this, so a legend never disagrees with the map. */
export function useHeadwayTiers() {
  const { colorVisionFriendly } = useColorVision();
  return getHeadwayTiers(colorVisionFriendly ? 'friendly' : 'default');
}
