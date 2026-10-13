import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router';
import App from './App';
import LegalPage from './LegalPage';
import AboutDocsPage from './AboutDocsPage';
import AboutPage from './AboutPage';
import ChangelogPage from './ChangelogPage';
import './styles/index.css';
import { FEATURES, FEATURE_ROUTES } from '../shared/config';
import { inject } from '@vercel/analytics';
import { injectSpeedInsights } from '@vercel/speed-insights';
import AnalyticsConsent from './components/AnalyticsConsent';
import { ColorVisionProvider } from './context/ColorVisionContext';
import { RETIRED_APP_PATHS } from './utils/appGate';
import RouteTracker from './components/RouteTracker';
import RouteSeo from './components/RouteSeo';
import { isInternalTestSession } from './lib/internalTest';

const AgencyPage = React.lazy(() => import('./AgencyPage'));
const ResearchPage = React.lazy(() => import('./apps/ResearchPage'));
const AreaPage = React.lazy(() => import('./AreaPage'));
const DiagnosticsUnevenPage = React.lazy(() => import('./DiagnosticsUnevenPage'));
const DiagnosticsPerformancePage = React.lazy(() => import('./DiagnosticsPerformancePage'));

/** Night Service moved from /apps/night to /research/night; keep old links and their filters working. */
function NightServiceRedirect() {
  const { search, hash } = useLocation();
  return <Navigate to={`${FEATURE_ROUTES.nightService}${search}${hash}`} replace />;
}

/** /docs is the short address for the Docs page at /about/docs. */
function DocsRedirect() {
  const { search, hash } = useLocation();
  return <Navigate to={`/about/docs${search}${hash}`} replace />;
}

// Collect page views only from deployed builds; local development should not
// pollute the production and beta analytics data.
if (import.meta.env.PROD && !isInternalTestSession()) {
  inject();
  injectSpeedInsights();
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <ColorVisionProvider>
        <AnalyticsConsent />
        <RouteTracker />
        <RouteSeo />
        <React.Suspense fallback={null}>
          <Routes>
          {/* Maintainer-only research page; it is never included in built bundles. */}
          {import.meta.env.DEV && (
            <>
              <Route path="/dev/diagnostics/uneven-headway" element={<DiagnosticsUnevenPage />} />
              <Route path="/dev/diagnostics/performance" element={<DiagnosticsPerformancePage />} />
            </>
          )}
          <Route path="/apps/night" element={<NightServiceRedirect />} />
          <Route path="/docs" element={<DocsRedirect />} />
          {RETIRED_APP_PATHS.map(path => <Route key={path} path={path} element={<Navigate to="/" replace />} />)}
          <Route path="/terms" element={<LegalPage document="terms" />} />
          <Route path="/privacy" element={<LegalPage document="privacy" />} />
          <Route path="/about/docs" element={<AboutDocsPage />} />
          <Route path="/about" element={<AboutPage />} />
          {/* Beta-only; on the public site /changelog falls through to the map. */}
          {FEATURES.whatsNew && <Route path="/changelog" element={<ChangelogPage />} />}
          {FEATURES.agencyPages && <Route path="/agency/:slug" element={<AgencyPage />} />}
          {FEATURES.researchApps && <Route path="/research" element={<ResearchPage />} />}
          {FEATURES.agencyPages && <Route path="/area/:slug" element={<AreaPage />} />}
          <Route path="/*" element={<App />} />
          </Routes>
        </React.Suspense>
      </ColorVisionProvider>
    </BrowserRouter>
  </React.StrictMode>
);
