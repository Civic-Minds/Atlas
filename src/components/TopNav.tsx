import React, { useState, useEffect } from 'react';
import { NavLink, Link } from 'react-router-dom';
import {
    Zap,
    Target,
    Activity,
    Map as MapIcon,
    LayoutGrid,
    Sun,
    Moon,
    Settings,
    ShieldCheck
} from 'lucide-react';

const HeadwayLogo = () => (
    <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6 text-white" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M7 6v12M17 6v12M7 12h10" />
        <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" opacity="0.5" />
    </svg>
);

const NAV_ITEMS = [
    {
        id: 'screener',
        title: 'Screen',
        icon: Target,
        path: '/screener'
    },
    {
        id: 'verifier',
        title: 'Verify',
        icon: ShieldCheck,
        path: '/verifier'
    },
    {
        id: 'simulator',
        title: 'Simulate',
        icon: Activity,
        path: '/simulator'
    },
    {
        id: 'explorer',
        title: 'Explorer',
        icon: MapIcon,
        path: '/explorer'
    },
    {
        id: 'predict',
        title: 'Predict',
        icon: Zap,
        path: '/predict'
    }
];

export const TopNav: React.FC = () => {
    const [theme, setTheme] = useState<'light' | 'dark'>(() => {
        if (typeof window !== 'undefined') {
            return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
        }
        return 'light';
    });

    useEffect(() => {
        if (theme === 'dark') {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    }, [theme]);

    const toggleTheme = () => {
        setTheme(prev => prev === 'light' ? 'dark' : 'light');
    };

    return (
        <header className="sticky top-0 z-50 w-full bg-[var(--bg)]/80 backdrop-blur-xl border-b border-[var(--border)] px-8 h-20 flex items-center justify-between transition-all duration-500">
            <div className="flex items-center gap-4">
                <Link to="/" className="flex items-center gap-3 group">
                    <div className="w-10 h-10 rounded-2xl bg-indigo-600 flex items-center justify-center shadow-xl shadow-indigo-500/30 group-hover:scale-110 group-hover:rotate-3 transition-all duration-500">
                        <HeadwayLogo />
                    </div>
                    <span className="text-2xl font-black tracking-tighter text-[var(--fg)] group-hover:tracking-tight transition-all duration-500">
                        Headway
                    </span>
                </Link>
            </div>

            <nav className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 hidden lg:flex items-center bg-[var(--card)]/40 backdrop-blur-2xl p-1.5 rounded-2xl border border-[var(--border)] shadow-2xl">
                <div className="flex items-center gap-1">
                    {NAV_ITEMS.map((item) => (
                        <NavLink
                            key={item.id}
                            to={item.path}
                            className={({ isActive }) =>
                                `flex items-center gap-2.5 px-5 py-2.5 rounded-xl transition-all duration-500 group relative ${isActive
                                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                                    : 'text-[var(--text-muted)] hover:text-[var(--fg)] hover:bg-[var(--item-bg)]'
                                }`
                            }
                        >
                            <item.icon className="w-4 h-4 transition-transform group-hover:scale-110" />
                            <span className="text-xs font-bold tracking-tight">
                                {item.title}
                            </span>
                            {/* Reflection effect for active state */}
                            <div className="absolute inset-0 bg-white/10 opacity-0 group-active:opacity-100 transition-opacity rounded-xl" />
                        </NavLink>
                    ))}
                </div>
            </nav>

            <div className="flex items-center gap-3">
                <Link
                    to="/admin"
                    className="p-3 rounded-2xl text-[var(--text-muted)] hover:text-indigo-500 hover:bg-indigo-500/5 transition-all duration-300 border border-transparent hover:border-indigo-500/20 shadow-sm"
                    title="Administrative Console"
                >
                    <ShieldCheck className="w-5 h-5" />
                </Link>
                <div className="w-px h-6 bg-[var(--border)] mx-1" />
                <button
                    onClick={toggleTheme}
                    className="p-3 rounded-2xl text-[var(--text-muted)] hover:text-[var(--fg)] hover:bg-[var(--item-bg)] transition-all duration-300 border border-transparent hover:border-[var(--border)] shadow-sm"
                >
                    {theme === 'light' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
                </button>
            </div>
        </header>
    );
};
