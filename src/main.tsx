import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router';
import App from './App';
import LegalPage from './LegalPage';
import './styles/index.css';
import { BETA_BUILD } from '../shared/config';
import { inject } from '@vercel/analytics';
import { injectSpeedInsights } from '@vercel/speed-insights';
import AnalyticsConsent from './components/AnalyticsConsent';

const DiagnosticsPage = React.lazy(() => import('./DiagnosticsPage'));
const DiagnosticsUnevenPage = React.lazy(() => import('./DiagnosticsUnevenPage'));

// Collect page views only from deployed builds; local development should not
// pollute the production and beta analytics data.
if (import.meta.env.PROD) {
  inject();
  injectSpeedInsights();
}

if (BETA_BUILD) {
  document.title = `[Beta] ${document.title}`;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AnalyticsConsent />
      <React.Suspense fallback={null}>
        <Routes>
          {/* Maintainer-only tools, local dev only -- not gated by DIAGNOSTICS_ENABLED/beta
              anymore. Both load every agency's data at once with no viewport limit, which is
              too heavy to leave reachable on any deployed build. import.meta.env.DEV is false
              in every built bundle, so these routes don't exist outside `npm run dev`. */}
          {import.meta.env.DEV && (
            <>
              <Route path="/apps/diagnostics/table" element={<DiagnosticsPage />} />
              <Route path="/apps/diagnostics/uneven-headway" element={<DiagnosticsUnevenPage />} />
              {/* Diagnostics moved from /apps/diagnostics to /apps/diagnostics/table -- redirect
                  the old bookmarked/typed URL instead of falling through to App's frequency map. */}
              <Route path="/apps/diagnostics" element={<Navigate to="/apps/diagnostics/table" replace />} />
            </>
          )}
          <Route path="/terms" element={<LegalPage document="terms" />} />
          <Route path="/privacy" element={<LegalPage document="privacy" />} />
          <Route path="/*" element={<App />} />
        </Routes>
      </React.Suspense>
    </BrowserRouter>
  </React.StrictMode>
);
