import React, { useState } from 'react';
import { NavLink, Link, useLocation } from 'react-router-dom';
import { Menu, X, ChevronDown, Sun, Moon } from 'lucide-react';
import { useTheme } from '../hooks/useTheme';
import { useAuthStore } from '../hooks/useAuthStore';
import { useViewAs } from '../hooks/useViewAs';
import { useTransitStore } from '../types/store';
import { fetchAgencies } from '../services/atlasApi';
import type { AgencyMeta } from '../services/atlasApi';

const NAV_ITEMS = [
    { id: 'analyze', title: 'Analyze', path: '/analyze' },
    { id: 'monitor', title: 'Monitor', path: '/monitor' },
    { id: 'predict', title: 'Predict', path: '/predict' },
    { id: 'simulate', title: 'Simulate', path: '/simulate' },
    { id: 'audit', title: 'Audit', path: '/audit' },
];

const SECONDARY_NAV = [
    { id: 'performance', title: 'Performance', path: '/performance' },
    { id: 'pulse', title: 'Pulse', path: '/pulse' },
    { id: 'alerts', title: 'Alerts', path: '/alerts' },
    { id: 'map', title: 'Map', path: '/map' },
];


export const TopNav: React.FC = () => {
    const location = useLocation();
    const { logout, role, user } = useAuthStore();
    const { viewAsAgency, setViewAsAgency } = useViewAs();
    const { clearData } = useTransitStore();
    const { theme, toggleTheme } = useTheme();
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [showViewAsMenu, setShowViewAsMenu] = useState(false);
    const isAdmin = role === 'admin' || role === 'researcher';
    const [agencies, setAgencies] = useState<AgencyMeta[]>([]);

    React.useEffect(() => {
        if (isAdmin) fetchAgencies().then(setAgencies).catch(console.warn);
    }, [isAdmin]);
    const displayName = user?.displayName || user?.email?.split('@')[0] || 'Admin';

    const handleSelectAgency = (slug: string) => {
        const agency = agencies.find(a => a.slug === slug) ?? null;
        setViewAsAgency(agency);
        setShowViewAsMenu(false);
    };

    const handleExitViewAs = () => {
        setViewAsAgency(null);
        clearData();
    };

    const currentNav = [...NAV_ITEMS, ...SECONDARY_NAV].find(item => location.pathname.startsWith(item.path));
    const moduleName = currentNav ? currentNav.title : '';

    return (
        <header className="sticky top-0 z-50 w-full bg-[var(--bg)]/80 backdrop-blur-md border-b border-[var(--border)] transition-colors duration-200">
            <div className="max-w-7xl mx-auto w-full px-4 md:px-8 h-16 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                    <Link to="/" className="flex items-center gap-2 no-underline cursor-pointer group">
                        <span className={`text-[18px] font-bold tracking-tight transition-colors ${moduleName ? 'text-[var(--text-muted)]' : 'text-[var(--text-primary)]'}`}>Atlas</span>
                        {moduleName && (
                            <span className="text-[16px] font-bold tracking-tight text-[var(--text-primary)]">{moduleName}</span>
                        )}
                    </Link>
                </div>

                <div className="flex items-center gap-4">
                    <nav className="hidden lg:flex items-center gap-5">
                        {NAV_ITEMS.map((item) => {
                            const isActive = location.pathname.startsWith(item.path);
                            return (
                                <NavLink
                                    key={item.id}
                                    to={item.path}
                                    className={`text-[12px] font-bold tracking-tight transition-colors ${isActive
                                        ? 'text-indigo-400'
                                        : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                                    }`}
                                >
                                    {item.title}
                                </NavLink>
                            );
                        })}
                        <div className="w-px h-4 bg-[var(--border)]" />
                        {SECONDARY_NAV.map((item) => {
                            const isActive = location.pathname.startsWith(item.path);
                            return (
                                <NavLink
                                    key={item.id}
                                    to={item.path}
                                    className={`text-[12px] font-medium transition-colors ${isActive
                                        ? 'text-[var(--text-primary)]'
                                        : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                                    }`}
                                >
                                    {item.title}
                                </NavLink>
                            );
                        })}
                    </nav>

                    <div className="hidden lg:block w-px h-5 bg-[var(--border)]" />
                    {/* Agency switcher — admin only */}
                    {isAdmin && (
                        <div className="hidden lg:flex items-center gap-2 relative">
                            <button
                                onClick={() => setShowViewAsMenu(v => !v)}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[11px] font-bold transition-colors ${
                                    viewAsAgency
                                        ? 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400'
                                        : 'bg-[var(--item-bg)] border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                                }`}
                            >
                                {viewAsAgency ? viewAsAgency.display_name : 'Agency'}
                                <ChevronDown className="w-3 h-3" />
                            </button>
                            {showViewAsMenu && (
                                <div className="absolute right-0 top-full mt-2 w-56 bg-[var(--bg)] border border-[var(--border)] rounded-xl shadow-lg overflow-hidden z-50">
                                    {viewAsAgency && (
                                        <button
                                            onClick={handleExitViewAs}
                                            className="w-full text-left px-4 py-2.5 text-[11px] font-bold text-[var(--text-muted)] hover:bg-[var(--item-bg)] transition-colors border-b border-[var(--border)]"
                                        >
                                            Clear selection
                                        </button>
                                    )}
                                    {agencies.length === 0 ? (
                                        <div className="px-4 py-3 text-[11px] text-[var(--text-muted)] italic">No agencies found</div>
                                    ) : (
                                        agencies.map(a => (
                                            <button
                                                key={a.slug}
                                                onClick={() => handleSelectAgency(a.slug)}
                                                className={`w-full text-left px-4 py-2.5 text-[12px] font-medium hover:bg-[var(--item-bg)] transition-colors ${
                                                    viewAsAgency?.slug === a.slug
                                                        ? 'text-indigo-400 font-bold'
                                                        : 'text-[var(--text-primary)]'
                                                }`}
                                            >
                                                {a.display_name}
                                            </button>
                                        ))
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Theme Toggle */}
                    <button
                        onClick={toggleTheme}
                        className="p-2 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--item-bg)] transition-all duration-200"
                        title={theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
                    >
                        {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
                    </button>

                    <div className="hidden lg:block w-px h-5 bg-[var(--border)]" />

                    {/* User */}
                    <div className="hidden lg:flex items-center gap-3">
                        <span className="text-[12px] text-[var(--text-muted)]">{displayName}</span>
                        <button
                            onClick={logout}
                            className="text-[11px] font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                        >
                            Log out
                        </button>
                    </div>

                    <button
                        className="lg:hidden p-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                        onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                    >
                        {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                    </button>
                </div>
            </div>

            {/* Mobile Menu */}
            {isMobileMenuOpen && (
                <div className="lg:hidden absolute top-16 left-0 w-full bg-[var(--bg)] border-b border-[var(--border)] p-4 flex flex-col gap-4 shadow-lg">
                    {NAV_ITEMS.map((item) => {
                        const isActive = location.pathname.startsWith(item.path);
                        return (
                            <NavLink
                                key={item.id}
                                to={item.path}
                                onClick={() => setIsMobileMenuOpen(false)}
                                className={`text-[13px] font-bold tracking-tight transition-all p-3 rounded-lg ${
                                    isActive
                                        ? 'bg-indigo-500/10 text-indigo-400'
                                        : 'text-[var(--text-muted)] hover:bg-[var(--item-bg)] hover:text-[var(--text-primary)]'
                                }`}
                            >
                                {item.title}
                            </NavLink>
                        );
                    })}
                    <div className="h-px w-full bg-[var(--border)]" />
                    <button
                        onClick={() => { setIsMobileMenuOpen(false); logout(); }}
                        className="text-[13px] font-bold text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors text-left p-3"
                    >
                        Log out
                    </button>
                </div>
            )}
        </header>
    );
};
