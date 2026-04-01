import React, { useState } from 'react';
import { NavLink, Link, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { useTheme } from '../hooks/useTheme';
import { useAuthStore } from '../hooks/useAuthStore';


const NAV_ITEMS = [
    { id: 'strategy', title: 'Strategy', path: '/strategy' },
    { id: 'intelligence', title: 'Intelligence', path: '/intelligence' },
    { id: 'simulate', title: 'Simulate', path: '/simulator', status: 'BETA' },
    { id: 'predict', title: 'Predict', path: '/predict', status: 'ALPHA' },
    { id: 'optimize', title: 'Optimize', path: '/atlas', status: 'ALPHA' },
    { id: 'audit', title: 'Audit', path: '/verifier', status: 'ALPHA' },
    { id: 'map', title: 'Live Map', path: '/map' }
];


export const TopNav: React.FC = () => {
    const location = useLocation();
    const { theme, toggleTheme } = useTheme();
    const { user, logout } = useAuthStore();
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

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
                    <Link to="/" className="flex items-center gap-1.5 group no-underline cursor-pointer">
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
                                    className={`text-[12px] font-bold tracking-tight transition-all duration-200 flex items-center gap-2 cursor-pointer group ${isActive
                                        ? 'text-indigo-400'
                                        : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                                        }`}
                                >
                                    {item.title}
                                    {item.status && (
                                        <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border transition-all ${
                                            isActive 
                                                ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400' 
                                                : 'bg-[var(--item-bg)] border-[var(--border)] text-[var(--text-muted)] opacity-50 group-hover:opacity-100'
                                        }`}>
                                            {item.status}
                                        </span>
                                    )}
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
                            className="hidden lg:block text-[13px] font-bold text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                        >
                            Log out
                        </button>

                        <button 
                            className="lg:hidden p-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                        >
                            {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                        </button>
                    </div>
                </div>
            </div>

            {/* Mobile Menu */}
            {isMobileMenuOpen && (
                <div className="lg:hidden absolute top-20 left-0 w-full bg-[var(--bg)] border-b border-[var(--border)] p-4 flex flex-col gap-4 shadow-lg animate-in slide-in-from-top-2">
                    {NAV_ITEMS.map((item) => {
                        const isActive = location.pathname.startsWith(item.path);
                        return (
                            <NavLink
                                key={item.id}
                                to={item.path}
                                onClick={() => setIsMobileMenuOpen(false)}
                                className={`text-[13px] font-bold tracking-tight transition-all duration-200 flex items-center justify-between p-3 rounded-lg ${
                                    isActive
                                        ? 'bg-indigo-500/10 text-indigo-400'
                                        : 'text-[var(--text-muted)] hover:bg-[var(--item-bg)] hover:text-[var(--text-primary)]'
                                    }`}
                            >
                                {item.title}
                                {item.status && (
                                    <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border transition-all ${
                                        isActive 
                                            ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400' 
                                            : 'bg-[var(--item-bg)] border-[var(--border)] text-[var(--text-muted)] opacity-50'
                                    }`}>
                                        {item.status}
                                    </span>
                                )}
                            </NavLink>
                        );
                    })}
                    <div className="h-px w-full bg-[var(--border)] my-2" />
                    <button
                        onClick={() => {
                            setIsMobileMenuOpen(false);
                            logout();
                        }}
                        className="text-[13px] font-bold text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors text-left p-3"
                    >
                        Log out
                    </button>
                </div>
            )}
        </header>
    );
};
