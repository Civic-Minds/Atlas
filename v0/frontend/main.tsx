import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import { useAuthStore } from './hooks/useAuthStore';
import './styles/index.css';

// Start Firebase auth listener before first render so persisted sessions
// resolve before any component checks isAuthenticated
useAuthStore.getState().initAuth();

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <ErrorBoundary>
            <App />
        </ErrorBoundary>
    </React.StrictMode>
);
