import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router';
import App from './App';
import LegalPage from './LegalPage';
import './styles/index.css';
import { FEATURES } from '../shared/config';
import { inject } from '@vercel/analytics';
import { injectSpeedInsights } from '@vercel/speed-insights';
import AnalyticsConsent from './components/AnalyticsConsent';
import { ColorVisionProvider } from './context/ColorVisionContext';

const DiagnosticsUnevenPage = React.lazy(() => import('./DiagnosticsUnevenPage'));

// Collect page views only from deployed builds; local development should not
// pollute the production and beta analytics data.
if (import.meta.env.PROD) {
  inject();
  injectSpeedInsights();
}

if (FEATURES.beta) {
  document.title = `[Beta] ${document.title}`;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <ColorVisionProvider>
        <AnalyticsConsent />
        <React.Suspense fallback={null}>
          <Routes>
          {/* Maintainer-only research page; it is never included in built bundles. */}
          {import.meta.env.DEV && (
            <>
              <Route path="/apps/diagnostics/uneven-headway" element={<DiagnosticsUnevenPage />} />
            </>
          )}
          <Route path="/terms" element={<LegalPage document="terms" />} />
          <Route path="/privacy" element={<LegalPage document="privacy" />} />
          <Route path="/*" element={<App />} />
          </Routes>
        </React.Suspense>
      </ColorVisionProvider>
    </BrowserRouter>
  </React.StrictMode>
);
