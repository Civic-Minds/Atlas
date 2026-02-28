import React, { Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { TopNav } from './components/TopNav';
import { CommandPalette } from './components/CommandPalette';
import { NotificationToast } from './components/NotificationToast';

// Lazy-loaded module views — each becomes a separate chunk
const HomePage = React.lazy(() => import('./modules/home/HomePage'));
const BurnerHomePage = React.lazy(() => import('./modules/home/BurnerHomePage'));
const SimulatorView = React.lazy(() => import('./modules/simulator/SimulatorView'));
const ScreenerView = React.lazy(() => import('./modules/screener/ScreenerView'));
const VerifierView = React.lazy(() => import('./modules/verifier/VerifierView'));
const AtlasView = React.lazy(() => import('./modules/atlas/AtlasView'));
const ReportCardsView = React.lazy(() => import('./modules/report-cards/ReportCardsView'));
const AdminView = React.lazy(() => import('./modules/admin/AdminView'));
const PredictView = React.lazy(() => import('./modules/predict/PredictView'));
const StrategyView = React.lazy(() => import('./modules/screener/components/StrategyView'));

const LazyFallback = () => (
    <div className="flex-1 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
    </div>
);

const App: React.FC = () => {
    const location = useLocation();

    return (
        <div className="flex flex-col bg-[var(--bg)] text-[var(--fg)] font-sans min-h-screen transition-colors duration-300">
            <NotificationToast />
            <TopNav />
            <CommandPalette />
            <main className="flex-1 flex flex-col overflow-hidden relative">
                <AnimatePresence mode="wait">
                    <motion.div
                        key={location.pathname}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.3, ease: 'easeInOut' }}
                        className="flex-1 flex flex-col overflow-hidden"
                    >
                        <Suspense fallback={<LazyFallback />}>
                            <Routes location={location}>
                                <Route path="/" element={<HomePage />} />
                                <Route path="/burner" element={<BurnerHomePage />} />
                                <Route path="/atlas/*" element={<AtlasView />} />
                                <Route path="/strategy/*" element={<ScreenerView />} />
                                <Route path="/simulator/*" element={<SimulatorView />} />
                                <Route path="/predict/*" element={<PredictView />} />
                                <Route path="/verifier/*" element={<VerifierView />} />
                                <Route path="/reports/*" element={<ReportCardsView />} />
                                <Route path="/admin/*" element={<AdminView />} />
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
