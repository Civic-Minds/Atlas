import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './styles/index.css';

(window as any).__workerDiag = [];
const OrigWorker = window.Worker;
(window as any).Worker = class extends OrigWorker {
  constructor(...args: ConstructorParameters<typeof OrigWorker>) {
    super(...args);
    (window as any).__workerDiag.push(['constructed', String(args[0])]);
    this.addEventListener('error', (e: ErrorEvent) => {
      (window as any).__workerDiag.push(['worker error', String(args[0]), e.message, e.filename, e.lineno]);
    });
    this.addEventListener('messageerror', () => {
      (window as any).__workerDiag.push(['worker messageerror', String(args[0])]);
    });
  }
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
);
