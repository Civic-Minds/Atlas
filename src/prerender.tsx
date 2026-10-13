/**
 * Build-time entry: renders the static pages to HTML so their text is in the served file.
 * Built with `vite build --ssr` (same mode and flags as the site) and used by
 * scripts/prerender-routes.ts. Never loaded in the browser.
 */
import type { ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router';
import { ATLAS_MODE, FEATURES } from '../shared/config';
import type { AgencyPageData } from '../shared/agencyPages';
import type { SeoFlags } from '../shared/seo';
import AboutDocsPage from './AboutDocsPage';
import AboutPage from './AboutPage';
import LegalPage from './LegalPage';
import ResearchPage from './apps/ResearchPage';
import AgencyPage from './AgencyPage';
import AreaPage from './AreaPage';
import type { AreaPageData } from '../shared/areaPages';
import AgenciesIndexPage from './AgenciesIndexPage';
import type { AgencyIndexData } from '../shared/agencyIndex';

const PAGES: Record<string, () => ReactElement> = {
  '/about': () => <AboutPage />,
  '/about/docs': () => <AboutDocsPage />,
  '/privacy': () => <LegalPage document="privacy" />,
  '/terms': () => <LegalPage document="terms" />,
  '/research': () => <ResearchPage />,
};

export const BUILD_MODE = ATLAS_MODE;

export const BUILD_FLAGS: SeoFlags = {
  researchApps: FEATURES.researchApps,
  whatsNew: FEATURES.whatsNew,
  live: FEATURES.live,
  history: FEATURES.history,
  corridors: FEATURES.corridors,
  agencyPages: FEATURES.agencyPages,
};

export function renderPage(path: string): string {
  const page = PAGES[path];
  if (!page) throw new Error(`No prerender page registered for ${path}`);
  return renderToString(<StaticRouter location={path}>{page()}</StaticRouter>);
}

export const PRERENDER_PATHS = Object.keys(PAGES);

export function renderAgencyPage(data: AgencyPageData): string {
  return renderToString(<StaticRouter location={`/agency/${data.agency.slug}`}><AgencyPage data={data} /></StaticRouter>);
}

export function renderAreaPage(data: AreaPageData): string {
  return renderToString(<StaticRouter location={`/area/${data.area.slug}`}><AreaPage data={data} /></StaticRouter>);
}

export function renderAgencyIndex(data: AgencyIndexData): string {
  return renderToString(<StaticRouter location="/agencies"><AgenciesIndexPage data={data} /></StaticRouter>);
}
