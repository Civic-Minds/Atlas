import React, { Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { TopNav } from './components/TopNav';
import { CommandPalette } from './components/CommandPalette';
import { NotificationToast } from './components/NotificationToast';
import { AuthSplash } from './components/AuthSplash';
import { useAuthStore } from './hooks/useAuthStore';

// Lazy-loaded module views — each becomes a separate chunk
const HomePage = React.lazy(() => import('./modules/home/HomePage'));
const SimulatorView = React.lazy(() => import('./modules/simulator/SimulatorView'));
const ScreenerView = React.lazy(() => import('./modules/screener/ScreenerView'));
const VerifierView = React.lazy(() => import('./modules/verifier/VerifierView'));
const ReportCardsView = React.lazy(() => import('./modules/report-cards/ReportCardsView'));
const AdminView = React.lazy(() => import('./modules/admin/AdminView'));
const PredictView = React.lazy(() => import('./modules/predict/PredictView'));
const MapView = React.lazy(() => import('./modules/map/MapView'));
const IntelligenceView = React.lazy(() => import('./modules/intelligence/IntelligenceView'));
const SystemReportView = React.lazy(() => import('./modules/screener/components/SystemReportView'));
const PulseView = React.lazy(() => import('./modules/pulse/PulseView'));
const PerformanceView = React.lazy(() => import('./modules/performance/PerformanceView'));
const AlertsView = React.lazy(() => import('./modules/alerts/AlertsView').then(m => ({ default: m.AlertsView })));


const LazyFallback = () => (
    <div className="flex-1 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
    </div>
);

// Shown while Firebase resolves the persisted session on first load
const AuthLoadingScreen = () => (
    <div className="fixed inset-0 bg-[var(--bg)] flex items-center justify-center z-[9999]">
        <div className="w-6 h-6 border-2 border-[var(--border)] border-t-indigo-500 rounded-full animate-spin" />
    </div>
);

import { useAutoLoadGtfs } from './hooks/useAutoLoadGtfs';

const App: React.FC = () => {
    const location = useLocation();
    const { isAuthenticated, isLoading } = useAuthStore();
    
    // Auto-load pre-populated network data for users
    useAutoLoadGtfs();

    if (isLoading) return <AuthLoadingScreen />;
    if (!isAuthenticated) return <AuthSplash />;

    return (
        <div className="flex flex-col bg-[var(--bg)] text-[var(--fg)] font-sans min-h-screen transition-colors duration-300">
            <NotificationToast />
            <TopNav />
            <CommandPalette />
            <main className="flex-1 flex flex-col overflow-hidden relative">
                <AnimatePresence>
                    <motion.div
                        key={location.pathname}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15, ease: 'linear' }}
                        className="flex-1 flex flex-col overflow-hidden"
                    >
                        <Suspense fallback={<LazyFallback />}>
                            <Routes location={location}>
                                <Route path="/" element={<HomePage />} />
                                <Route path="/monitor" element={<IntelligenceView />} />
                                <Route path="/analyze" element={<ScreenerView />} />
                                <Route path="/analyze/report" element={<SystemReportView />} />

                                <Route path="/simulate" element={<SimulatorView />} />
                                <Route path="/predict" element={<PredictView />} />
                                <Route path="/audit" element={<VerifierView />} />
                                <Route path="/reports" element={<ReportCardsView />} />
                                <Route path="/pulse" element={<PulseView />} />
                                <Route path="/performance" element={<PerformanceView />} />
                                <Route path="/alerts" element={<AlertsView />} />
                                <Route path="/map" element={<MapView />} />
                                <Route path="/admin" element={<AdminView />} />
                                <Route path="*" element={<Navigate to="/" replace />} />
                            </Routes>
                        </Suspense>
                    </motion.div>
                </AnimatePresence>
            </main>
        </div>
    );
};

const Root: React.FC = () => {
    // Strip trailing slash for react-router basename compatibility
    const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '') || '/';
    return (
        <Router basename={base}>
            <App />
        </Router>
    );
};

export default Root;
