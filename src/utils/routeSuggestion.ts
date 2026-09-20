/**
 * Suggested-route grouping for agencies that publish one route per direction.
 * BART's public route names use a -N/-S suffix for this purpose.
 */
export function suggestedRouteGroupKey(agencySlug: string, shortName: string): string {
  if (agencySlug === 'bart') {
    return shortName.replace(/-[NS]$/i, '');
  }
  return shortName;
}

export function combineSuggestedRouteNames(names: string[]): string | null {
  const unique = [...new Set(names.filter(Boolean))];
  if (unique.length === 0) return null;
  if (unique.length === 1) return unique[0];

  const directions = unique
    .map(name => name.match(/^(.+?)\s+to\s+(.+)$/i))
    .filter((match): match is RegExpMatchArray => match != null);
  if (directions.length === unique.length) {
    const endpoints = [...new Set(directions.flatMap(match => [match[1], match[2]]))];
    if (endpoints.length === 2) return `${endpoints[0]} ↔ ${endpoints[1]}`;
  }

  return unique.join(' / ');
}
