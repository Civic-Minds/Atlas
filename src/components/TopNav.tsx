import React, { useState, useEffect } from 'react';
import { NavLink, Link, useLocation } from 'react-router-dom';
import {
    Zap,
    Target,
    Activity,
    Map as MapIcon,
    Sun,
    Moon,
    ShieldCheck
} from 'lucide-react';

const HeadwayLogo = () => (
    <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6 text-white" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M7 6v12M17 6v12M7 12h10" />
        <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" opacity="0.5" />
    </svg>
);

const NAV_ITEMS = [
    { id: 'screener', title: 'Screen', icon: Target, path: '/screener' },
    { id: 'verifier', title: 'Verify', icon: ShieldCheck, path: '/verifier' },
    { id: 'simulator', title: 'Simulate', icon: Activity, path: '/simulator' },
    { id: 'explorer', title: 'Explorer', icon: MapIcon, path: '/explorer' },
    { id: 'predict', title: 'Predict', icon: Zap, path: '/predict' }
];

export const TopNav: React.FC = () => {
    const location = useLocation();
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
        <header className="sticky top-0 z-50 w-full bg-[var(--bg)] border-b border-[var(--border)] px-8 h-20 flex items-center justify-between transition-colors duration-200">
            <div className="flex items-center gap-4">
                <Link to="/" className="flex items-center gap-3 group">
                    <div className="w-10 h-10 rounded-lg bg-[var(--accent-primary)] flex items-center justify-center shadow-lg transition-transform duration-200 group-hover:scale-105">
                        <HeadwayLogo />
                    </div>
                    <span className="text-2xl font-bold tracking-tighter text-[var(--text-primary)]">
                        Headway
                    </span>
                </Link>
            </div>

            <nav className="hidden lg:flex items-center gap-1">
                {NAV_ITEMS.map((item) => (
                    <NavLink
                        key={item.id}
                        to={item.path}
                        className={({ isActive }) =>
                            `flex items-center gap-2 px-5 py-2 rounded-md transition-all duration-200 group relative ${isActive
                                ? 'text-[var(--accent-primary)]'
                                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--item-bg)]'
                            }`
                        }
                    >
                        <item.icon className={`w-4 h-4 transition-transform group-hover:scale-110 ${location.pathname.startsWith(item.path) ? 'text-[var(--accent-primary)]' : ''}`} />
                        <span className="text-xs font-bold tracking-tight uppercase tracking-wider">
                            {item.title}
                        </span>
                        {location.pathname.startsWith(item.path) && (
                            <div className="absolute -bottom-[26px] left-0 right-0 h-0.5 bg-[var(--accent-primary)] shadow-[0_-2px_8px_var(--accent-primary)]" />
                        )}
                    </NavLink>
                ))}
            </nav>

            <div className="flex items-center gap-2">
                <Link
                    to="/admin"
                    className="p-2.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--accent-primary)] hover:bg-[var(--item-bg)] transition-all duration-200 border border-transparent hover:border-[var(--border)]"
                    title="Administrative Console"
                >
                    <ShieldCheck className="w-5 h-5" />
                </Link>
                <div className="w-px h-5 bg-[var(--border)] mx-1" />
                <button
                    onClick={toggleTheme}
                    className="p-2.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--item-bg)] transition-all duration-200 border border-transparent hover:border-[var(--border)]"
                >
                    {theme === 'light' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
                </button>
            </div>
        </header>
    );
};
