import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router';
import App from './App';
import LegalPage from './LegalPage';
import AboutDocsPage from './AboutDocsPage';
import AboutPage from './AboutPage';
import ChangelogPage from './ChangelogPage';
import './styles/index.css';
import { FEATURES } from '../shared/config';
import { inject } from '@vercel/analytics';
import { injectSpeedInsights } from '@vercel/speed-insights';
import AnalyticsConsent from './components/AnalyticsConsent';
import { ColorVisionProvider } from './context/ColorVisionContext';
import RouteTracker from './components/RouteTracker';
import RouteSeo from './components/RouteSeo';
import { isInternalTestSession } from './lib/internalTest';

const DiagnosticsUnevenPage = React.lazy(() => import('./DiagnosticsUnevenPage'));
const DiagnosticsPerformancePage = React.lazy(() => import('./DiagnosticsPerformancePage'));

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
              <Route path="/apps/diagnostics/uneven-headway" element={<DiagnosticsUnevenPage />} />
              <Route path="/apps/diagnostics/performance" element={<DiagnosticsPerformancePage />} />
            </>
          )}
          <Route path="/terms" element={<LegalPage document="terms" />} />
          <Route path="/privacy" element={<LegalPage document="privacy" />} />
          <Route path="/about/docs" element={<AboutDocsPage />} />
          <Route path="/about" element={<AboutPage />} />
          {/* Beta-only; on the public site /changelog falls through to the map. */}
          {FEATURES.whatsNew && <Route path="/changelog" element={<ChangelogPage />} />}
          <Route path="/*" element={<App />} />
          </Routes>
        </React.Suspense>
      </ColorVisionProvider>
    </BrowserRouter>
  </React.StrictMode>
);
