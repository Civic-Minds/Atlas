/**
 * The one place "and N others" overflow wording is built. Every list that shows a few items and
 * counts the rest calls this, so the count always names what it is counting
 * ("and 1 other agency", "and 3 other agencies"), never a bare "and 3 others" or "+3 more".
 */
export function andOthers(count: number, singular: string, plural: string = `${singular}s`): string {
  return `and ${count} other ${count === 1 ? singular : plural}`;
}
