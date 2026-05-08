import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, ChevronDown, Check, Bus, Train, TramFront as Tram, Ship, Info, Zap } from 'lucide-react';
import { AvailableRoute } from '../data/routeData';

interface RouteSelectorProps {
    selectedRouteId: string;
    onRouteSelect: (routeId: string) => void;
    routes: AvailableRoute[];
}

const getModeIcon = (type: string) => {
    switch (type) {
        case '0':
        case '1': return Train;
        case '2': return Train;
        case '3': return Bus;
        case '4': return Ship;
        case '5': return Tram;
        default: return Bus;
    }
};

const RouteSelector: React.FC<RouteSelectorProps> = ({ selectedRouteId, onRouteSelect, routes }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const containerRef = useRef<HTMLDivElement>(null);

    const selectedRoute = routes.find(r => r.id === selectedRouteId) || routes[0];

    const filteredRoutes = routes.filter(r =>
        r.name.toLowerCase().includes(search.toLowerCase()) ||
        r.id.toLowerCase().includes(search.toLowerCase())
    );

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    if (routes.length === 0) return null;

    const Icon = selectedRoute ? getModeIcon(selectedRoute.type) : Bus;

    return (
        <div className="relative w-full max-w-sm" ref={containerRef}>
            <motion.button
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center justify-between w-full px-4 py-2.5 bg-[var(--item-bg)]/40 backdrop-blur-md border border-[var(--border)] rounded-2xl hover:border-indigo-500/50 transition-all shadow-[0_1px_15px_-5px_rgba(0,0,0,0.1)] group"
            >
                <div className="flex items-center gap-4 overflow-hidden">
                    <div className="relative">
                        <div
                            className="w-11 h-11 rounded-xl flex flex-col items-center justify-center shrink-0 border border-white/20 shadow-lg relative overflow-hidden"
                            style={{ backgroundColor: selectedRoute?.color || '#6366f1' }}
                        >
                            <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent pointer-events-none" />
                            <Icon className="w-5 h-5 text-white drop-shadow-md z-10" />
                        </div>
                        {selectedRoute?.type === '1' && (
                            <div className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-500 border-2 border-[var(--bg)] rounded-full flex items-center justify-center">
                                <Zap className="w-2.5 h-2.5 text-white" />
                            </div>
                        )}
                    </div>
                    <div className="text-left overflow-hidden">
                        <div className="text-[9px] font-black uppercase tracking-[0.2em] text-indigo-500 mb-0.5">Active Operation</div>
                        <div className="text-sm font-extrabold text-[var(--fg)] truncate tracking-tight">{selectedRoute?.name}</div>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <div className="h-6 w-px bg-[var(--border)]" />
                    <ChevronDown className={`w-4 h-4 text-[var(--text-muted)] transition-transform duration-500 cubic-bezier(0.4, 0, 0.2, 1) ${isOpen ? 'rotate-180 text-indigo-500' : ''}`} />
                </div>
            </motion.button>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 16, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 12, scale: 0.96 }}
                        transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
                        className="absolute top-full left-0 right-0 mt-3 z-50 bg-[var(--bg)]/90 backdrop-blur-xl border border-[var(--border)] rounded-[24px] shadow-[0_20px_50px_-12px_rgba(0,0,0,0.3)] overflow-hidden flex flex-col max-h-[480px]"
                    >
                        <div className="p-4 border-b border-[var(--border)] bg-gradient-to-b from-[var(--item-bg)]/10 to-transparent">
                            <div className="relative group">
                                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)] group-focus-within:text-indigo-500 transition-colors" />
                                <input
                                    autoFocus
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    placeholder="Search systems & routes..."
                                    className="w-full pl-10 pr-4 py-3 bg-[var(--bg)]/50 border border-[var(--border)] rounded-xl text-xs font-bold tracking-tight focus:outline-none focus:border-indigo-500/50 focus:ring-4 focus:ring-indigo-500/10 transition-all placeholder:font-normal placeholder:opacity-50"
                                />
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-2 custom-scrollbar space-y-1">
                            {filteredRoutes.length > 0 ? (
                                filteredRoutes.map((route, idx) => {
                                    const RouteIcon = getModeIcon(route.type);
                                    const isSelected = route.id === selectedRouteId;
                                    return (
                                        <motion.button
                                            key={route.id}
                                            initial={{ opacity: 0, x: -8 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: idx * 0.02 }}
                                            onClick={() => {
                                                onRouteSelect(route.id);
                                                setIsOpen(false);
                                                setSearch('');
                                            }}
                                            className={`group/item flex items-center justify-between w-full p-2.5 rounded-[14px] transition-all relative ${isSelected
                                                ? 'bg-indigo-500/10 ring-1 ring-indigo-500/20'
                                                : 'hover:bg-indigo-500/5 hover:translate-x-1'
                                                }`}
                                        >
                                            <div className="flex items-center gap-3.5 overflow-hidden z-10">
                                                <div
                                                    className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border border-white/10 shadow-sm relative overflow-hidden"
                                                    style={{ backgroundColor: route.color || '#6366f1' }}
                                                >
                                                    <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent pointer-events-none" />
                                                    <RouteIcon className="w-4 h-4 text-white drop-shadow-sm" />
                                                </div>
                                                <div className="text-left overflow-hidden">
                                                    <div className={`text-sm font-bold truncate transition-colors ${isSelected ? 'text-indigo-500' : 'text-[var(--fg)] group-hover/item:text-indigo-400'}`}>{route.name}</div>
                                                    <div className="text-[9px] font-mono text-[var(--text-muted)] uppercase tracking-wider">{route.id}</div>
                                                </div>
                                            </div>
                                            {isSelected && (
                                                <motion.div
                                                    layoutId="selected-check"
                                                    className="bg-indigo-500 rounded-full p-0.5 shadow-sm mr-1 z-10"
                                                >
                                                    <Check className="w-3 h-3 text-white" />
                                                </motion.div>
                                            )}
                                        </motion.button>
                                    );
                                })
                            ) : (
                                <div className="p-12 text-center">
                                    <div className="w-12 h-12 bg-[var(--item-bg)]/50 rounded-full flex items-center justify-center mx-auto mb-4 border border-[var(--border)]">
                                        <Info className="w-6 h-6 text-[var(--text-muted)] opacity-30" />
                                    </div>
                                    <p className="text-[11px] atlas-label text-[var(--text-muted)] lowercase">No results found</p>
                                </div>
                            )}
                        </div>
                        <div className="p-3 bg-[var(--item-bg)]/30 border-t border-[var(--border)] text-center">
                            <span className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-widest">{filteredRoutes.length} Available Corridors</span>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default RouteSelector;

