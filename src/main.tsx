import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router';
import App from './App';
import DiagnosticsPage from './DiagnosticsPage';
import './styles/index.css';
import { BETA_BUILD, DIAGNOSTICS_ENABLED } from '../shared/config';

if (BETA_BUILD) {
  document.title = `[Beta] ${document.title}`;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        {DIAGNOSTICS_ENABLED && (
          <>
            <Route path="/apps/diagnostics/table" element={<DiagnosticsPage />} />
            {/* Diagnostics moved from /apps/diagnostics to /apps/diagnostics/table -- redirect
                the old bookmarked/typed URL instead of falling through to App's frequency map. */}
            <Route path="/apps/diagnostics" element={<Navigate to="/apps/diagnostics/table" replace />} />
          </>
        )}
        <Route path="/*" element={<App />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
