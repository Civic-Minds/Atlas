import React, { useState } from 'react';
import { NavLink, Link, useLocation } from 'react-router-dom';
import { Menu, X, ChevronDown } from 'lucide-react';
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
    { id: 'map', title: 'Map', path: '/map' },
];


export const TopNav: React.FC = () => {
    const location = useLocation();
    const { logout, role, user } = useAuthStore();
    const { viewAsAgency, setViewAsAgency } = useViewAs();
    const { clearData } = useTransitStore();
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [showViewAsMenu, setShowViewAsMenu] = useState(false);
    const isAdmin = role === 'admin';
    const [agencies, setAgencies] = useState<AgencyMeta[]>([]);

    React.useEffect(() => {
        if (isAdmin) fetchAgencies().then(setAgencies).catch(() => {});
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

    return (
        <header className="sticky top-0 z-50 w-full bg-[var(--bg)]/80 backdrop-blur-md border-b border-[var(--border)] transition-colors duration-200">
            <div className="max-w-7xl mx-auto w-full px-8 h-16 flex items-center justify-between">
                <div className="flex items-center">
                    <Link to="/" className="flex items-center gap-1.5 no-underline cursor-pointer">
                        <span className="text-[18px] font-bold tracking-tight text-[var(--text-primary)]">Atlas</span>
                        <span className="text-[18px] font-medium tracking-normal text-[var(--text-muted)]">by Civic Minds</span>
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
                    {/* View As — admin only */}
                    {isAdmin && (
                        <div className="hidden lg:flex items-center gap-2">
                            {viewAsAgency ? (
                                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
                                    <span className="text-[11px] font-bold text-indigo-400">Viewing as {viewAsAgency.display_name}</span>
                                    <button
                                        onClick={handleExitViewAs}
                                        className="text-indigo-400 hover:text-indigo-300 transition-colors"
                                    >
                                        <X className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            ) : (
                                <div className="relative">
                                    <button
                                        onClick={() => setShowViewAsMenu(v => !v)}
                                        className="flex items-center gap-1.5 text-[11px] font-bold text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                                    >
                                        View as agency
                                        <ChevronDown className="w-3 h-3" />
                                    </button>
                                    {showViewAsMenu && (
                                        <div className="absolute right-0 top-full mt-2 w-52 bg-[var(--bg)] border border-[var(--border)] rounded-xl shadow-lg overflow-hidden z-50">
                                            {agencies.length === 0 ? (
                                                <div className="px-4 py-3 text-[11px] text-[var(--text-muted)] italic">No agencies found</div>
                                            ) : (
                                                agencies.map(agency => (
                                                    <button
                                                        key={agency.slug}
                                                        onClick={() => handleSelectAgency(agency.slug)}
                                                        className="w-full text-left px-4 py-2.5 text-[12px] font-medium text-[var(--text-primary)] hover:bg-[var(--item-bg)] transition-colors"
                                                    >
                                                        {agency.display_name}
                                                    </button>
                                                ))
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

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
