/**
 * Map links made before an agency was renamed or merged (NJ Transit: njt-bus and njt-rail are now njt) still open the
 * same agency, route and stop. shared/data/former-slugs.json is written from each agency config's `formerSlugs` by
 * scripts/build-area-page-list.ts, which also writes the /agency/<old> page redirects.
 */
import formerSlugData from '../../shared/data/former-slugs.json';

const FORMER: Readonly<Record<string, { slug: string; idPrefix?: string }>> = formerSlugData;

/** The current slug for a slug a link names; unknown slugs pass through. */
export function currentAgencySlug(slug: string): string {
  return FORMER[slug]?.slug ?? slug;
}

/**
 * An `agency::id[...]` key from a link (route card, stop card, route chooser) with an old agency slug moved to the
 * agency's current slug. With `prefixId` (route keys), the id takes the prefix the old agency's route ids now carry.
 */
export function currentAgencyKey(key: string, prefixId: boolean): string {
  const at = key.indexOf('::');
  if (at < 0) return currentAgencySlug(key);
  const former = FORMER[key.slice(0, at)];
  if (!former) return key;
  const rest = key.slice(at + 2);
  return `${former.slug}::${prefixId && former.idPrefix ? former.idPrefix + rest : rest}`;
}
