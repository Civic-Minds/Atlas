/**
 * Whether the committed agency page summaries (shared/data/agency-pages.json) were built from the data
 * release the site serves (atlas/release.json). They are regenerated after a publish and committed; when
 * that step is missed, agency and area pages read a release behind the map (#1156: TTC page 232 routes,
 * map card 230). Pure: the CLI (check-agency-pages.ts) reads both IDs.
 */

export const REGENERATE_HELP = [
  'Regenerate the summaries from the public release (read-only, about 1.5 GB of downloads, run throttled):',
  '  nice -n 15 npx tsx scripts/build-agency-page-summaries.ts',
  'then commit shared/data/agency-pages.json and shared/data/agency-page-slugs.json.',
  'publish-data-release runs it after each publish and opens the agency-pages pull request; merging that pull request does the same.',
].join('\n');

export interface FreshnessResult {
  status: 'current' | 'behind' | 'unknown';
  message: string;
}

export function agencyPagesFreshness(summaryReleaseId: string | null | undefined, publicReleaseId: string | null | undefined): FreshnessResult {
  if (!summaryReleaseId) return { status: 'unknown', message: 'shared/data/agency-pages.json has no releaseId.' };
  if (!publicReleaseId) return { status: 'unknown', message: 'The public atlas/release.json could not be read, so the summaries were not checked.' };
  if (summaryReleaseId === publicReleaseId) return { status: 'current', message: `Agency page summaries match the public release (${publicReleaseId}).` };
  return {
    status: 'behind',
    message: `Agency page summaries are from ${summaryReleaseId}, but the site serves ${publicReleaseId}: agency and area pages show the older release's numbers.`,
  };
}
