import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import HomePage from './modules/home/HomePage';
import SimulatorView from './modules/simulator/SimulatorView';
import ScreenerView from './modules/screener/ScreenerView';
import VerifierView from './modules/verifier/VerifierView';
import MapView from './modules/map/MapView';
import OptimizeView from './modules/optimize/OptimizeView';
import ReportCardsView from './modules/report-cards/ReportCardsView';
import AdminView from './modules/admin/AdminView';
import PredictView from './modules/predict/PredictView';
import { TopNav } from './components/TopNav';
import { CommandPalette } from './components/CommandPalette';
import { NotificationToast } from './components/NotificationToast';

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
                        <Routes location={location}>
                            <Route path="/" element={<HomePage />} />
                            <Route path="/simulator/*" element={<SimulatorView />} />
                            <Route path="/screener/*" element={<ScreenerView />} />
                            <Route path="/verifier/*" element={<VerifierView />} />
                            <Route path="/explorer/*" element={<MapView />} />
                            <Route path="/optimize/*" element={<OptimizeView />} />
                            <Route path="/reports/*" element={<ReportCardsView />} />
                            <Route path="/admin/*" element={<AdminView />} />
                            <Route path="/predict/*" element={<PredictView />} />
                            <Route path="*" element={<Navigate to="/" replace />} />
                        </Routes>
                    </motion.div>
                </AnimatePresence>
            </main>
        </div>
    );
};

const Root: React.FC = () => (
    <Router basename="/Atlas">
        <App />
    </Router>
);

export default Root;
