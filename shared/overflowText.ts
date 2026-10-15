/**
 * The one place list and count wording is built: "route" / "routes", "A, B and C", and the
 * "and N others" overflow. Every list that shows a few items and counts the rest calls these, so the
 * count always names what it is counting ("and 1 other agency", "and 3 other agencies"), never a bare
 * "and 3 others" or "+3 more".
 */

/** The singular for exactly one, the plural otherwise (0 is plural): plural(1, 'route') is "route", plural(0, 'agency', 'agencies') is "agencies". */
export function plural(count: number, singular: string, pluralForm: string = `${singular}s`): string {
  return count === 1 ? singular : pluralForm;
}

/** "A", "A and B", "A, B and C" (no comma before "and" unless `oxford` is set). An empty list is an empty string. */
export function joinList(items: readonly string[], options: { oxford?: boolean } = {}): string {
  if (items.length <= 1) return items.join('');
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}${options.oxford ? ',' : ''} and ${items[items.length - 1]}`;
}

export function andOthers(count: number, singular: string, pluralForm: string = `${singular}s`): string {
  return `and ${count} other ${plural(count, singular, pluralForm)}`;
}
