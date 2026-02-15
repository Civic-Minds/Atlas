import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import HomePage from './modules/home/HomePage';
import SimulatorView from './modules/simulator/SimulatorView';
import ScreenerView from './modules/screener/ScreenerView';
import VerifierView from './modules/verifier/VerifierView';
import MapView from './modules/map/MapView';
import OptimizeView from './modules/optimize/OptimizeView';
import { TopNav } from './components/TopNav';

const App: React.FC = () => {
    return (
        <Router>
            <div className="flex flex-col bg-[var(--bg)] text-[var(--fg)] font-sans min-h-screen transition-colors duration-300">
                <TopNav />
                <main className="flex-1 flex flex-col overflow-hidden">
                    <Routes>
                        <Route path="/" element={<HomePage />} />
                        <Route path="/simulator/*" element={<SimulatorView />} />
                        <Route path="/screener/*" element={<ScreenerView />} />
                        <Route path="/verifier/*" element={<VerifierView />} />
                        <Route path="/atlas/*" element={<MapView />} />
                        <Route path="/optimize/*" element={<OptimizeView />} />
                        <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                </main>
            </div>
        </Router>
    );
};

export default App;
