import React from 'react';
import { NavLink, Link, useLocation } from 'react-router-dom';
import {
    Target,
    Activity,
    Zap,
    TrendingUp,
    FileCheck,
    ShieldCheck,
    Sun,
    Moon,
    Globe
} from 'lucide-react';
import { useTheme } from '../hooks/useTheme';

const AtlasLogo = () => (
    <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="logo-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#fff" stopOpacity="1" />
                <stop offset="100%" stopColor="#ffffff88" stopOpacity="1" />
            </linearGradient>
        </defs>
        <path d="M12 3L3 19H21L12 3Z" fill="url(#logo-grad)" fillOpacity="0.2" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M8 12H16" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M12 3L7 12H17L12 3Z" fill="white" fillOpacity="0.4" />
    </svg>
);

const NAV_ITEMS = [
    { id: 'verify', title: 'Verify', icon: FileCheck, path: '/verifier' },
    { id: 'screen', title: 'Screen', icon: Target, path: '/screener' },
    { id: 'strategy', title: 'Strategy', icon: TrendingUp, path: '/strategy' },
    { id: 'simulate', title: 'Simulate', icon: Activity, path: '/simulator' },
    { id: 'predict', title: 'Predict', icon: Zap, path: '/predict' }
];

export const TopNav: React.FC = () => {
    const location = useLocation();
    const { theme, toggleTheme } = useTheme();

    return (
        <header className="sticky top-0 z-50 w-full bg-[var(--bg)]/80 backdrop-blur-md border-b border-[var(--border)] px-8 h-20 flex items-center justify-between transition-colors duration-200">
            <div className="flex items-center gap-6">
                <Link to="/" className="flex items-center gap-3 group">
                    <div className="w-10 h-10 rounded-lg bg-[var(--accent-primary)] flex items-center justify-center shadow-lg transition-transform duration-200 group-hover:scale-105">
                        <AtlasLogo />
                    </div>
                    <div className="flex flex-col">
                        <span className="text-2xl font-black tracking-tighter text-[var(--text-primary)] leading-none">
                            Atlas
                        </span>
                        <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-[0.2em] mt-1">
                            by Civic Minds
                        </span>
                    </div>
                </Link>
                <div className="w-px h-8 bg-[var(--border)] ml-2" />
                <NavLink
                    to="/atlas"
                    className={({ isActive }) =>
                        `p-2.5 rounded-lg transition-all duration-200 group ${isActive ? 'text-emerald-500 bg-emerald-500/5' : 'text-[var(--text-muted)] hover:text-emerald-500'}`
                    }
                    title="Open Map"
                >
                    <Globe className="w-5 h-5 transition-transform group-hover:scale-110" />
                </NavLink>
            </div>

            <nav className="hidden lg:flex items-center gap-2 bg-[var(--item-bg)]/50 p-1.5 rounded-2xl border border-[var(--border)]">
                {NAV_ITEMS.map((item) => {
                    const isActive = location.pathname.startsWith(item.path);
                    return (
                        <NavLink
                            key={item.id}
                            to={item.path}
                            className={`flex items-center gap-2.5 px-5 py-2.5 rounded-xl transition-all duration-300 group relative ${isActive
                                ? 'text-white bg-indigo-600 shadow-lg shadow-indigo-600/30 font-bold'
                                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--item-bg)]'
                                }`}
                        >
                            <item.icon className={`w-4 h-4 transition-transform duration-500 ${isActive ? 'scale-110 rotate-[5deg]' : 'group-hover:scale-110'}`} />
                            <span className="text-[10px] font-black tracking-[0.1em] uppercase">
                                {item.title}
                            </span>
                        </NavLink>
                    );
                })}
            </nav>

            <div className="flex items-center gap-2">
                <Link
                    to="/admin"
                    className="p-2.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--accent-primary)] transition-all duration-200"
                    title="Administrative Console"
                >
                    <ShieldCheck className="w-5 h-5" />
                </Link>
                <div className="w-px h-5 bg-[var(--border)] mx-1" />
                <button
                    onClick={toggleTheme}
                    className="p-2.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-all duration-200"
                >
                    {theme === 'light' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
                </button>
            </div>
        </header >
    );
};
