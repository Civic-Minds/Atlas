import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router';
import App from './App';
import LegalPage from './LegalPage';
import AboutDocsPage from './AboutDocsPage';
import AboutPage from './AboutPage';
import PlannersPage from './PlannersPage';
import ResearchersPage from './ResearchersPage';
import ChangelogPage from './ChangelogPage';
import NotFoundPage from './NotFoundPage';
import './styles/index.css';
import { FEATURES, FEATURE_ROUTES } from '../shared/config';
import { inject } from '@vercel/analytics';
import { injectSpeedInsights } from '@vercel/speed-insights';
import AnalyticsConsent from './components/AnalyticsConsent';
import { ColorVisionProvider } from './context/ColorVisionContext';
import { RETIRED_APP_PATHS } from './utils/appGate';
import RouteTracker from './components/RouteTracker';
import RouteSeo from './components/RouteSeo';
import ScrollToTop from './components/ScrollToTop';
import { parseStudioPath } from '../shared/studioAgencies';
import HomeRemount from './components/HomeRemount';
import { isInternalTestSession } from './lib/internalTest';
import { withoutMapPosition } from './lib/analytics';
import { trackKeyboardFocus } from './lib/keyboardFocus';
import { RESEARCH_DRAFTS } from './apps/researchDrafts';
import { findSeoRoute } from '../shared/seo';
import { ABOUT_PATH, AGENCY_INDEX_PATH, AGENCY_PATH_PREFIX, AREA_PATH_PREFIX, CHANGELOG_PATH, DOCS_PATH, LIVE_PATH, PLANNERS_PATH, PRIVACY_PATH, REGION_PATH_PREFIX, RESEARCHERS_PATH, TERMS_PATH } from '../shared/pagePaths';

const AgencyPage = React.lazy(() => import('./AgencyPage'));
const LiveRoutePage = React.lazy(() => import('./LiveRoutePage'));
const LiveAgencyPage = React.lazy(() => import('./LiveAgencyPage'));
const LiveToolPage = React.lazy(() => import('./LiveToolPage'));
const ResearchPage = React.lazy(() => import('./apps/ResearchPage'));
const FreeChildFaresPage = React.lazy(() => import('./apps/FreeChildFaresPage'));
const FrequentServiceStoryPage = React.lazy(() => import('./apps/FrequentServiceStoryPage'));
const AreaPage = React.lazy(() => import('./AreaPage'));
const RegionPage = React.lazy(() => import('./RegionPage'));
const AgenciesIndexPage = React.lazy(() => import('./AgenciesIndexPage'));
// Studio is local only (FEATURES.studio is the dev server); the DEV check keeps its page out of deployed bundles entirely.
const InternalHomePage = import.meta.env.DEV ? React.lazy(() => import('./InternalHomePage')) : () => null;
const StudioCoveragePage = import.meta.env.DEV ? React.lazy(() => import('./StudioCoveragePage')) : () => null;
const McpDocsPage = import.meta.env.DEV ? React.lazy(() => import('./McpDocsPage')) : () => null;
// The diagnostics pages are maintainer-only (#1518): the same DEV check as Studio keeps them out of built bundles entirely.
const DiagnosticsUnevenPage = import.meta.env.DEV ? React.lazy(() => import('./DiagnosticsUnevenPage')) : () => null;
const DiagnosticsPerformancePage = import.meta.env.DEV ? React.lazy(() => import('./DiagnosticsPerformancePage')) : () => null;

/** Night Service moved from /apps/night to /research/night; keep old links and their filters working. */
function NightServiceRedirect() {
  const { search, hash } = useLocation();
  return <Navigate to={`${FEATURE_ROUTES.nightService}${search}${hash}`} replace />;
}

/** The map answers only the addresses the site knows; anything else gets the not-found page. */
function MapOrNotFound() {
  const { pathname } = useLocation();
  // Atlas Studio (CIV-1828) is a view of the map, as History is, and local only, so it has no page entry of its own.
  // Its own addresses (/studio, /studio/live/…, /studio/fleet/…, CIV-1924); any other /studio/… stays not-found.
  const studio = FEATURES.studio && parseStudioPath(pathname) != null;
  return findSeoRoute(pathname) || studio
    ? <HomeRemount>{goHome => <App onGoHome={goHome} />}</HomeRemount>
    : <NotFoundPage />;
}

/** /docs is the short address for the Docs page at /about/docs. */
function DocsRedirect() {
  const { search, hash } = useLocation();
  return <Navigate to={`${DOCS_PATH}${search}${hash}`} replace />;
}

// Collect page views only from deployed builds; local development should not
// pollute the production and beta analytics data.
if (import.meta.env.PROD && !isInternalTestSession()) {
  // #1519: Vercel gets the address without the map's lat and lon.
  inject({ beforeSend: event => ({ ...event, url: withoutMapPosition(event.url) }) });
  injectSpeedInsights({ beforeSend: event => ({ ...event, url: withoutMapPosition(event.url) }) });
}

trackKeyboardFocus();

const rootElement = document.getElementById('root')!;
// A prerendered page already has its text in #root. Keep showing that same HTML while the page's code chunk
// loads, so there is no blank flash (and never a not-found message) before the live page takes over.
const prerenderedHtml = rootElement.innerHTML.trim();

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <BrowserRouter>
      <ColorVisionProvider>
        <AnalyticsConsent />
        <RouteTracker />
        <RouteSeo />
        <ScrollToTop />
        <React.Suspense fallback={prerenderedHtml ? <div style={{ display: 'contents' }} dangerouslySetInnerHTML={{ __html: prerenderedHtml }} /> : null}>
          <Routes>
          {/* Maintainer-only research page; it is never included in built bundles. */}
          {import.meta.env.DEV && (
            <>
              <Route path="/dev/diagnostics/uneven-headway" element={<DiagnosticsUnevenPage />} />
              <Route path="/dev/diagnostics/performance" element={<DiagnosticsPerformancePage />} />
              {/* CIV-1550: research stories still being built, for Ryan's review; the list is empty outside the dev server. */}
              {RESEARCH_DRAFTS.map(({ href, Component }) => <Route key={href} path={href} element={<Component />} />)}
            </>
          )}
          {/* Live report pages: on where FEATURES.liveReports is, which includes the dev server (docs/FEATURE_FLAGS.md). */}
          {FEATURES.liveReports && <Route path={`${LIVE_PATH}/:agency/tool`} element={<LiveToolPage />} />}
          {FEATURES.liveReports && <Route path={`${LIVE_PATH}/:agency/:route`} element={<LiveRoutePage />} />}
          {FEATURES.liveReports && <Route path={`${LIVE_PATH}/:agency`} element={<LiveAgencyPage />} />}
          {/* Atlas Studio (CIV-1693): local only, on where FEATURES.studio is (docs/FEATURE_FLAGS.md). It is a view of the
              map (App, CIV-1828), so its own address falls through to the map below; the two earlier pages' addresses open it. */}
          {/* CIV-1871: what each agency has, local only; its address only, no link to it yet. */}
          {/* CIV-1872: the local-only home page; its "Internal" tag link and the header's internal links are dev only too. */}
          {FEATURES.internal && <Route path={FEATURE_ROUTES.internal} element={<InternalHomePage />} />}
          {/* CIV-1900: the MCP's internal docs page, linked from /internal. */}
          {FEATURES.internal && <Route path={FEATURE_ROUTES.mcpDocs} element={<McpDocsPage />} />}
          {FEATURES.studio && <Route path={FEATURE_ROUTES.studioCoverage} element={<StudioCoveragePage />} />}
          {FEATURES.studio && <Route path={FEATURE_ROUTES.studioVehicles} element={<Navigate to={FEATURE_ROUTES.studio} replace />} />}
          {FEATURES.studio && <Route path={FEATURE_ROUTES.studioChanges} element={<Navigate to={FEATURE_ROUTES.studio} replace />} />}
          <Route path="/apps/night" element={<NightServiceRedirect />} />
          <Route path="/docs" element={<DocsRedirect />} />
          {RETIRED_APP_PATHS.map(path => <Route key={path} path={path} element={<Navigate to="/" replace />} />)}
          <Route path={TERMS_PATH} element={<LegalPage document="terms" />} />
          <Route path={PRIVACY_PATH} element={<LegalPage document="privacy" />} />
          <Route path={DOCS_PATH} element={<AboutDocsPage />} />
          {/* Local only (CIV-1704): FEATURES.plannersLink, docs/FEATURE_FLAGS.md. */}
          {FEATURES.plannersLink && <Route path={PLANNERS_PATH} element={<PlannersPage />} />}
          {/* Local only (CIV-1709): FEATURES.researchersLink, docs/FEATURE_FLAGS.md. */}
          {FEATURES.researchersLink && <Route path={RESEARCHERS_PATH} element={<ResearchersPage />} />}
          <Route path={ABOUT_PATH} element={<AboutPage />} />
          {/* On in every build; beta-tagged entries still show only on beta. */}
          <Route path={CHANGELOG_PATH} element={<ChangelogPage />} />
          <Route path={`${AGENCY_PATH_PREFIX}:slug`} element={<AgencyPage />} />
          {FEATURES.researchApps && <Route path={FEATURE_ROUTES.research} element={<ResearchPage />} />}
          {FEATURES.researchApps && <Route path={FEATURE_ROUTES.freeChildFares} element={<FreeChildFaresPage />} />}
          {FEATURES.frequentService && <Route path={FEATURE_ROUTES.frequentService.story} element={<FrequentServiceStoryPage />} />}
          <Route path={`${AREA_PATH_PREFIX}:slug`} element={<AreaPage />} />
          <Route path={`${REGION_PATH_PREFIX}:slug`} element={<RegionPage />} />
          <Route path={AGENCY_INDEX_PATH} element={<AgenciesIndexPage />} />
          <Route path="/*" element={<MapOrNotFound />} />
          </Routes>
        </React.Suspense>
      </ColorVisionProvider>
    </BrowserRouter>
  </React.StrictMode>
);
