import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
    Search,
    Zap,
    Target,
    Activity,
    Map as MapIcon,
    ShieldCheck,
    Command,
    ArrowRight,
    Sun,
    Moon,
    TrendingUp,
    Globe
} from 'lucide-react';
import { useTheme } from '../hooks/useTheme';

interface CommandItem {
    id: string;
    title: string;
    description: string;
    icon: React.ElementType;
    shortcut?: string;
    action: () => void;
    category: string;
}

export const CommandPalette: React.FC = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [selectedIndex, setSelectedIndex] = useState(0);
    const navigate = useNavigate();
    const inputRef = useRef<HTMLInputElement>(null);
    const { toggleTheme } = useTheme();

    const COMMANDS: CommandItem[] = [
        {
            id: 'screener',
            title: 'Open Screener',
            description: 'Analyze GTFS frequency and reliability',
            icon: Target,
            action: () => navigate('/screener'),
            category: 'Navigation'
        },
        {
            id: 'verifier',
            title: 'Open Verifier',
            description: 'Human-in-the-loop data validation',
            icon: ShieldCheck,
            action: () => navigate('/verifier'),
            category: 'Navigation'
        },
        {
            id: 'simulator',
            title: 'Open Simulator',
            description: 'Model stop consolidation and travel times',
            icon: Activity,
            action: () => navigate('/simulator'),
            category: 'Navigation'
        },
        {
            id: 'strategy',
            title: 'Open Strategy',
            description: 'Executive performance audits and benchmarks',
            icon: TrendingUp,
            action: () => navigate('/strategy'),
            category: 'Navigation'
        },
        {
            id: 'atlas',
            title: 'Map Explorer',
            description: 'Global frequency map and system viewer',
            icon: Globe,
            action: () => navigate('/atlas'),
            category: 'Navigation'
        },
        {
            id: 'predict',
            title: 'Open Predict',
            description: 'Identify transit deserts and gaps',
            icon: Zap,
            action: () => navigate('/predict'),
            category: 'Navigation'
        },
        {
            id: 'theme-toggle',
            title: 'Toggle Theme',
            description: 'Switch between light and dark mode',
            icon: Moon,
            action: () => toggleTheme(),
            category: 'Settings'
        }
    ];

    const filteredCommands = COMMANDS.filter(cmd =>
        cmd.title.toLowerCase().includes(query.toLowerCase()) ||
        cmd.description.toLowerCase().includes(query.toLowerCase())
    );

    const togglePalette = useCallback(() => setIsOpen(prev => !prev), []);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                togglePalette();
            }
            if (e.key === 'Escape') {
                setIsOpen(false);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [togglePalette]);

    useEffect(() => {
        if (isOpen) {
            setSelectedIndex(0);
            setQuery('');
            setTimeout(() => inputRef.current?.focus(), 50);
        }
    }, [isOpen]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedIndex(prev => (prev + 1) % filteredCommands.length);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedIndex(prev => (prev - 1 + filteredCommands.length) % filteredCommands.length);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (filteredCommands[selectedIndex]) {
                filteredCommands[selectedIndex].action();
                setIsOpen(false);
            }
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] px-4 pointer-events-none">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setIsOpen(false)}
                        className="fixed inset-0 bg-black/40 backdrop-blur-sm pointer-events-auto"
                    />

                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: -20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: -20 }}
                        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                        className="w-full max-w-2xl glass-panel relative z-10 overflow-hidden pointer-events-auto shadow-2xl border-white/5"
                        onKeyDown={handleKeyDown}
                    >
                        {/* Search Input */}
                        <div className="flex items-center gap-3 px-6 py-5 border-b border-[var(--border)] bg-[var(--card)]/50">
                            <Search className="w-5 h-5 text-[var(--text-muted)]" />
                            <input
                                ref={inputRef}
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="Type a command or search for data..."
                                className="flex-1 bg-transparent border-none outline-none text-lg font-medium text-[var(--fg)] placeholder:[var(--text-muted)]"
                            />
                            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-[var(--item-bg)] border border-[var(--border)] shadow-sm">
                                <Command className="w-3 h-3 text-[var(--text-muted)]" />
                                <span className="text-[10px] font-black text-[var(--text-muted)]">K</span>
                            </div>
                        </div>

                        {/* Results */}
                        <div className="max-h-[400px] overflow-y-auto p-2 custom-scrollbar">
                            {filteredCommands.length > 0 ? (
                                <div className="flex flex-col gap-1">
                                    {filteredCommands.map((cmd, idx) => (
                                        <button
                                            key={cmd.id}
                                            onClick={() => {
                                                cmd.action();
                                                setIsOpen(false);
                                            }}
                                            onMouseEnter={() => setSelectedIndex(idx)}
                                            className={`flex items-center gap-4 w-full p-4 rounded-xl transition-all text-left group ${selectedIndex === idx
                                                ? 'bg-indigo-600 shadow-lg shadow-indigo-500/20'
                                                : 'hover:bg-[var(--item-bg)]'
                                                }`}
                                        >
                                            <div className={`p-2.5 rounded-xl border ${selectedIndex === idx
                                                ? 'bg-white/20 border-white/20 text-white'
                                                : 'bg-[var(--item-bg)] border-[var(--border)] text-indigo-500'
                                                }`}>
                                                <cmd.icon className="w-5 h-5" />
                                            </div>
                                            <div className="flex-1">
                                                <div className={`text-sm font-black tracking-tight ${selectedIndex === idx ? 'text-white' : 'text-[var(--fg)]'
                                                    }`}>
                                                    {cmd.title}
                                                </div>
                                                <div className={`text-xs font-medium opacity-70 ${selectedIndex === idx ? 'text-white' : 'text-[var(--text-muted)]'
                                                    }`}>
                                                    {cmd.description}
                                                </div>
                                            </div>
                                            {selectedIndex === idx && (
                                                <motion.div
                                                    initial={{ x: -10, opacity: 0 }}
                                                    animate={{ x: 0, opacity: 1 }}
                                                    className="flex items-center gap-2 text-white/80 text-[10px] font-black uppercase tracking-widest"
                                                >
                                                    <span>Execute</span>
                                                    <ArrowRight className="w-4 h-4" />
                                                </motion.div>
                                            )}
                                        </button>
                                    ))}
                                </div>
                            ) : (
                                <div className="py-12 flex flex-col items-center justify-center text-center opacity-40">
                                    <Search className="w-8 h-8 mb-3" />
                                    <p className="text-sm font-bold uppercase tracking-wider">No results for "{query}"</p>
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="px-6 py-3 border-t border-[var(--border)] bg-[var(--item-bg)]/30 flex items-center justify-between">
                            <div className="flex gap-4">
                                <div className="flex items-center gap-2">
                                    <kbd className="px-1.5 py-0.5 rounded border border-[var(--border)] bg-[var(--bg)] text-[9px] font-black atlas-mono shadow-sm">↑↓</kbd>
                                    <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-tight">Navigate</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <kbd className="px-1.5 py-0.5 rounded border border-[var(--border)] bg-[var(--bg)] text-[9px] font-black atlas-mono shadow-sm">↵</kbd>
                                    <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-tight">Select</span>
                                </div>
                            </div>
                            <span className="text-[9px] font-black text-indigo-500/50 uppercase tracking-[0.2em]">Atlas Instrument v1.5</span>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};
