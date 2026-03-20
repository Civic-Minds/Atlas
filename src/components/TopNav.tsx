import React from 'react';
import { NavLink, Link, useLocation } from 'react-router-dom';
import { useTheme } from '../hooks/useTheme';
import { useAuthStore } from '../hooks/useAuthStore';


const NAV_ITEMS = [
    { id: 'audit', title: 'Audit', path: '/verifier' },
    { id: 'strategy', title: 'Strategy', path: '/strategy' },
    { id: 'simulate', title: 'Simulate', path: '/simulator' },
    { id: 'predict', title: 'Predict', path: '/predict' },
    { id: 'optimize', title: 'Optimize', path: '/atlas' }
];


export const TopNav: React.FC = () => {
    const location = useLocation();
    const { theme, toggleTheme } = useTheme();
    const { user, logout } = useAuthStore();

    // Derive avatar label: first letter of display name, or first letter of email
    const avatarLabel = user?.displayName
        ? user.displayName[0].toUpperCase()
        : user?.email
            ? user.email[0].toUpperCase()
            : '?';

    const displayName = user?.displayName || user?.email?.split('@')[0] || 'User';

    return (
        <header className="sticky top-0 z-50 w-full bg-[var(--bg)]/80 backdrop-blur-md border-b border-[var(--border)] transition-colors duration-200">
            <div className="max-w-7xl mx-auto w-full px-8 h-20 flex items-center justify-between">
                <div className="flex items-center">
                    <Link to="/" className="flex items-center gap-1.5 group text-decoration-none">
                        <span className="text-[20px] font-bold tracking-tight text-[var(--text-primary)]">
                            Atlas
                        </span>
                        <span className="text-[20px] font-medium tracking-normal text-[var(--text-muted)]">
                            by Civic Minds
                        </span>
                    </Link>
                </div>

                <div className="flex items-center gap-10">
                    <nav className="hidden lg:flex items-center gap-8">
                        {NAV_ITEMS.map((item) => {
                            const isActive = location.pathname.startsWith(item.path);
                            return (
                                <NavLink
                                    key={item.id}
                                    to={item.path}
                                    className={`text-[13px] font-semibold transition-colors ${isActive
                                        ? 'text-[var(--text-primary)]'
                                        : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                                        }`}
                                >
                                    {item.title}
                                </NavLink>
                            );
                        })}
                    </nav>

                    <div className="hidden lg:block w-px h-6 bg-[var(--border)]" />

                    {/* User avatar + logout */}
                    <div className="flex items-center gap-3">
                        <div
                            title={displayName}
                            className="w-7 h-7 rounded-full bg-indigo-500/15 border border-indigo-500/20 flex items-center justify-center text-[11px] font-black text-indigo-500 select-none"
                        >
                            {avatarLabel}
                        </div>
                        <button
                            onClick={logout}
                            className="text-[13px] font-bold text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                        >
                            Log out
                        </button>
                    </div>
                </div>
            </div>
        </header>
    );
};
