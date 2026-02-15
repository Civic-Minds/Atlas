import React, { useState, useEffect } from 'react';
import { NavLink, Link } from 'react-router-dom';
import {
    Zap,
    Target,
    Activity,
    Map as MapIcon,
    LayoutGrid,
    Sun,
    Moon
} from 'lucide-react';

const NAV_ITEMS = [
    { id: 'screener', title: 'Screen', icon: <Zap className="w-4 h-4" />, path: '/screener' },
    { id: 'verifier', title: 'Verify', icon: <Target className="w-4 h-4" />, path: '/verifier' },
    { id: 'simulator', title: 'Simulate', icon: <Activity className="w-4 h-4" />, path: '/simulator' },
    { id: 'atlas', title: 'Atlas', icon: <MapIcon className="w-4 h-4" />, path: '/atlas' },
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
        <header className="sticky top-0 z-50 w-full bg-[var(--card)] border-b border-[var(--border)] px-8 h-16 flex items-center justify-between transition-colors duration-300">
            <div className="flex items-center gap-3">
                <Link to="/" className="flex items-center gap-3 group">
                    <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-500/20 group-hover:scale-110 transition-transform">
                        <Activity className="w-5 h-5 text-white" />
                    </div>
                    <span className="text-xl font-black tracking-tight text-[var(--fg)]">
                        Atlas
                    </span>
                </Link>
            </div>

            <nav className="absolute left-1/2 -translate-x-1/2 hidden md:flex items-center bg-[var(--item-bg)] p-1 rounded-xl border border-[var(--border)] shadow-soft">
                {NAV_ITEMS.map((item) => (
                    <NavLink
                        key={item.id}
                        to={item.path}
                        className={({ isActive }: { isActive: boolean }) => `
                            flex items-center gap-2 px-6 py-2 rounded-lg text-xs font-bold transition-all duration-200
                            ${isActive
                                ? 'bg-[var(--bg)] text-indigo-600 dark:text-indigo-400 shadow-sm border border-[var(--border)]'
                                : 'text-[var(--text-muted)] hover:text-[var(--fg)] hover:bg-[var(--item-hover)]'}
                        `}
                    >
                        {item.icon}
                        <span className="hidden lg:block">{item.title}</span>
                    </NavLink>
                ))}
            </nav>

            <div className="flex items-center gap-4">
                <button
                    onClick={toggleTheme}
                    className="p-2 rounded-xl text-[var(--text-muted)] hover:text-[var(--fg)] hover:bg-[var(--item-bg)] transition-all border border-transparent hover:border-[var(--border)]"
                >
                    {theme === 'light' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
                </button>
            </div>
        </header>
    );
};
