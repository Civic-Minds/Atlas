/**
 * Where the stop card's top goes: above the point when it fits there, else below it, else as far down as keeps it whole
 * inside the map (8px from each edge). 16px clear of the point either way.
 */
export function cardTop(y: number, cardH: number, mapH: number): number {
  if (y - 16 - cardH >= 8) return y - 16 - cardH;
  if (y + 16 + cardH <= mapH - 8) return y + 16;
  return Math.max(8, mapH - 8 - cardH);
}
