/**
 * Stop and place names, normalised for matching a typed place against stop names (CIV-1864): the MCP's routes_near and
 * trip_time read the same rules. "Stn" is "station", "St" is "street", punctuation is a space.
 */
export function stopMatchText(s: string): string {
  // #1773: accents fold to their letters ("Aéroport Montréal" reads as "aeroport montreal"), as hyphens fold to spaces.
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\bstn\b/g, 'station').replace(/\bst\b\.?/g, 'street').replace(/[^a-z0-9]+/g, ' ').trim();
}

/** A place's parts, for a corner ("Bathurst and Bloor", "King & Spadina", "Main at Queen"): each street on its own. */
export function placeParts(place: string): string[] {
  return place.toLowerCase().replace(/\bstn\b/g, 'station').replace(/\bst\b\.?/g, 'street').split(/\s*(?:\band\b|&|\bat\b|\/|,|\+)\s*/).map(stopMatchText).filter(Boolean);
}
