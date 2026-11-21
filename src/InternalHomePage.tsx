import { useEffect } from 'react';
import DocsPageLayout from './components/ui/DocsPageLayout';
import Card from './components/ui/Card';
import AppLink from './components/ui/AppLink';
import { SectionTitle } from './components/ui/PageTitle';
import { INTERNAL_GROUPS, INTERNAL_HOME_TITLE } from '../shared/internalPages';
import { tabTitle } from '../shared/pageNames';

/**
 * CIV-1872: the local-only home page, on the content-page layout, headings and card the rest of the site uses (Ryan: no new
 * sizes). One card per local-only page, in groups, all the same size, each with a line on what it is. The dev server serves
 * it (main.tsx), and the "Internal" tag beside the Atlas name opens it. Its words are in shared/internalPages.ts.
 */
/** One size for every card: equal grid rows, and each card fills its cell and never goes below this minimum. */
const CARD = 'min-h-40 w-full';

export default function InternalHomePage() {
  useEffect(() => { document.title = tabTitle(INTERNAL_HOME_TITLE); }, []);
  return (
    <DocsPageLayout width="wide">
      {INTERNAL_GROUPS.map(group => (
        <section key={group.heading} className="mt-12 first:mt-0" aria-labelledby={`internal-${group.heading}`}>
          <SectionTitle id={`internal-${group.heading}`}>{group.heading}</SectionTitle>
          <ul className="mt-4 grid auto-rows-fr gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {group.pages.map(page => (
              <li key={page.path} className="flex">
                <Card as={AppLink} to={page.path} tone="surface" padding="regular" className={`block ${CARD} hover:border-[var(--accent)]`}>
                  <SectionTitle level="item">{page.title}</SectionTitle>
                  <p className="mt-1 text-sm leading-6 text-[var(--text-muted)]">{page.description}</p>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </DocsPageLayout>
  );
}
