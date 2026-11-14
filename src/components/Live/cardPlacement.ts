/**
 * Where the stop card's top goes, clear of the map's controls: above the point when it fits under the measure pills
 * (`top`), else below it when it fits above the key (`bottom`), else as low as keeps it whole between them, and
 * failing that 8px inside the map. 16px clear of the point either way (#1151).
 */
export function cardTop(y: number, cardH: number, mapH: number, top = 8, bottom = 8): number {
  if (y - 16 - cardH >= top) return y - 16 - cardH;
  if (y + 16 + cardH <= mapH - bottom) return y + 16;
  if (mapH - bottom - cardH >= top) return mapH - bottom - cardH;
  return Math.max(8, mapH - 8 - cardH);
}
