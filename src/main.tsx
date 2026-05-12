import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import App from './App';
import Interval from './apps/Interval';
import './styles/index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />}>
          <Route index element={null} />
          <Route path="interval" element={<Interval />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
