import { HOME_DESCRIPTION, SITE_NAME } from '../shared/seo';
import { ABOUT_PATH, AGENCY_INDEX_PATH, DOCS_PATH } from '../shared/pagePaths';
import { ABOUT_ATLAS, READ_HOW_ATLAS_WORKS, SEE_ALL_AGENCIES } from './content/noticeCopy';
import { PageTitle } from './components/ui/PageTitle';
import ArrowLink from './components/ui/ArrowLink';

/**
 * #1522: the home page's text in its served HTML, so "/" reads as a page without JavaScript. Only the build writes it
 * (scripts/prerender-routes.ts); the map replaces it as soon as the app mounts. No new words: the site name, the home
 * description its tags already carry, and the existing link labels.
 */
export default function HomeStatic() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-16">
      <PageTitle>{SITE_NAME}</PageTitle>
      <p className="mt-4 text-base leading-7 text-[var(--text-muted)]">{HOME_DESCRIPTION}</p>
      <nav className="mt-6 flex flex-col gap-2">
        <ArrowLink href={AGENCY_INDEX_PATH}>{SEE_ALL_AGENCIES}</ArrowLink>
        <ArrowLink href={ABOUT_PATH}>{ABOUT_ATLAS}</ArrowLink>
        <ArrowLink href={DOCS_PATH}>{READ_HOW_ATLAS_WORKS}</ArrowLink>
      </nav>
    </main>
  );
}
