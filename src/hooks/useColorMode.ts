import { useColorVision } from '../context/ColorVisionContext';
import type { ColorVisionMode } from '../utils/colors';

/** The palette for the person's colour-vision setting ('friendly' or 'default'), read the same way everywhere. */
export function useColorMode(): ColorVisionMode {
  return useColorVision().colorVisionFriendly ? 'friendly' : 'default';
}
