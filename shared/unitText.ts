/**
 * The app's one way to write a measured distance, speed or density (CIV-1590; docs/style/TEXT.md "Numbers"):
 * "400 m", "25 km/h", "1,234" people per square kilometre. Built on numberText.ts. The unit words around a density
 * ("people per square kilometre") are approved text in noticeCopy.ts; prose such as "about 1 km" stays as written.
 */
import { countText, decimalText } from './numberText.js';

/** "400 m": a distance in whole metres. */
export const metresText = (metres: number): string => `${countText(metres)} m`;

/** "25 km/h": a speed in whole kilometres an hour. */
export const speedText = (kmh: number): string => `${countText(kmh)} km/h`;

/** "5.3" under 10, "1,234" from 10: people per square kilometre, so a sparse tract doesn't read "0" or "5". */
export const densityText = (perKm2: number): string => (perKm2 < 10 ? decimalText(perKm2, 1) : countText(perKm2));
