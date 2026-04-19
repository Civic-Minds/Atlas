import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ChevronRight, Filter, Clock, Map as MapIcon, RotateCcw, Download, ShieldCheck, Upload, Database, FileCheck, FileText, Activity, Cloud, HardDrive } from 'lucide-react';
import { AnalysisResult, GtfsData, SpacingResult, CorridorResult } from '../../utils/gtfsUtils';
import { downloadCsv, downloadJson } from '../../utils/exportUtils';
import { storage, STORES } from '../../core/storage';
import { ModuleHeader } from '../../components/ModuleHeader';
import { EmptyStateHero } from '../../components/EmptyStateHero';
import { ModuleLanding } from '../../components/ModuleLanding';
import { useGtfsWorker } from '../../hooks/useGtfsWorker';
import { useAuthStore } from '../../hooks/useAuthStore';
import { useTransitStore } from '../../types/store';
import { useNotificationStore } from '../../hooks/useNotification';
import { CorridorAuditModal } from './components/CorridorAuditModal';
import { StopHealthModal } from './components/StopHealthModal';
import { ValidationReportModal } from './components/ValidationReportModal';
import { RouteDetailModal } from './components/RouteDetailModal';
import { CommitModal } from './components/CommitModal';
import { NetworkScreener } from './components/NetworkScreener';
import { CriteriaPanel } from './components/CriteriaPanel';
import { CatalogExplorer } from './components/CatalogExplorer';
import { useCatalogStore } from '../../types/catalogStore';
import AtlasView from '../atlas/AtlasView';


const TIER_CONFIG = [
    { id: '5', label: 'Rapid', name: 'Rapid', color: 'cyan' },
    { id: '8', label: 'Freq++', name: 'Freq++', color: 'teal' },
    { id: '10', label: 'Freq+', name: 'Freq+', color: 'emerald' },
    { id: '15', label: 'Freq', name: 'Freq', color: 'blue' },
    { id: '20', label: 'Good', name: 'Good', color: 'indigo' },
    { id: '30', label: 'Basic', name: 'Basic', color: 'amber' },
    { id: '60', label: 'Infreq', name: 'Infreq', color: 'orange' },
    { id: 'span', label: 'Span', name: 'Span', color: 'slate' }
];

/** Static class maps — Tailwind JIT can't detect dynamically interpolated class names */
const TIER_ACTIVE_CLASSES: Record<string, string> = {
    cyan: 'border-cyan-500/40 bg-cyan-500/5',
    teal: 'border-teal-500/40 bg-teal-500/5',
    emerald: 'border-emerald-500/40 bg-emerald-500/5',
    blue: 'border-blue-500/40 bg-blue-500/5',
    indigo: 'border-indigo-500/40 bg-indigo-500/5',
    amber: 'border-amber-500/40 bg-amber-500/5',
    orange: 'border-orange-500/40 bg-orange-500/5',
    slate: 'border-slate-500/40 bg-slate-500/5',
};

const TIER_VALUE_CLASSES: Record<string, string> = {
    cyan: 'text-cyan-600 dark:text-cyan-400',
    teal: 'text-teal-600 dark:text-teal-400',
    emerald: 'text-emerald-600 dark:text-emerald-400',
    blue: 'text-blue-600 dark:text-blue-400',
    indigo: 'text-indigo-600 dark:text-indigo-400',
    amber: 'text-amber-600 dark:text-amber-400',
    orange: 'text-orange-600 dark:text-orange-400',
    slate: 'text-slate-600 dark:text-slate-400',
};

const TIER_BADGE_CLASSES: Record<string, string> = {
    cyan: 'text-cyan-600 dark:text-cyan-400 bg-cyan-500/5 border-cyan-500/10',
    teal: 'text-teal-600 dark:text-teal-400 bg-teal-500/5 border-teal-500/10',
    emerald: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/5 border-emerald-500/10',
    blue: 'text-blue-600 dark:text-blue-400 bg-blue-500/5 border-blue-500/10',
    indigo: 'text-indigo-600 dark:text-indigo-400 bg-indigo-500/5 border-indigo-500/10',
    amber: 'text-amber-600 dark:text-amber-400 bg-amber-500/5 border-amber-500/10',
    orange: 'text-orange-600 dark:text-orange-400 bg-orange-500/5 border-orange-500/10',
    slate: 'text-slate-600 dark:text-slate-400 bg-slate-500/5 border-slate-500/10',
};

export default function ScreenerView() {
    const { isAuthenticated, role, globalMode, toggleGlobalMode, agencyId } = useAuthStore();
    const isAdmin = role === 'admin' || role === 'researcher';
    const {
        gtfsData,
        analysisResults,
        spacingResults,
        validationReport,
        setRawData,
        loadPersistedData,
        clearData
    } = useTransitStore();

    const { addToast } = useNotificationStore();
    const navigate = useNavigate();
    const [corridorResults, setCorridorResults] = useState<CorridorResult[]>([]);
    const [showCorridors, setShowCorridors] = useState(false);
    const [showDiagnostics, setShowDiagnostics] = useState(false);
    const [showValidation, setShowValidation] = useState(false);
    const [selectedRouteResult, setSelectedRouteResult] = useState<AnalysisResult | null>(null);
    const [activeDay, setActiveDay] = useState('Weekday');
    const [searchQuery, setSearchQuery] = useState('');
    const [activeTiers, setActiveTiers] = useState<Set<string>>(new Set());
    const [resetPending, setResetPending] = useState(false);
    const [showCommit, setShowCommit] = useState(false);
    const [lastFileName, setLastFileName] = useState('feed.zip');
    const [pendingFile, setPendingFile] = useState<File | null>(null);
    const mode = 'network';
    const [activeView, setActiveView] = useState<'data' | 'map'>('data');

    const fileInputRef = useRef<HTMLInputElement>(null);
    const { loading, status, error, runAnalysis } = useGtfsWorker();
    const { loadCatalog } = useCatalogStore();

    // Load persisted data on mount
    useEffect(() => {
        if (!gtfsData) {
            loadPersistedData();
        }
        loadCatalog();
    }, [loadPersistedData, gtfsData, loadCatalog]);

    // Surface worker errors as toasts
    useEffect(() => {
        if (error) addToast(`Analysis failed: ${error}`, 'error');
    }, [error, addToast]);

    const handleReset = async () => {
        if (!resetPending) {
            setResetPending(true);
            addToast('Click Reset again within 3 seconds to confirm.', 'warning');
            setTimeout(() => setResetPending(false), 3000);
            return;
        }
        setResetPending(false);
        await clearData();
        addToast('Data cleared successfully', 'info');
    };

    const filteredResults = useMemo(() => {
        return analysisResults.filter(r => {
            const matchesDay = r.day === activeDay;
            const matchesTier = activeTiers.size === 0 || activeTiers.has(r.tier);
            const matchesSearch = r.route.toLowerCase().includes(searchQuery.toLowerCase());
            
            // If tenant filter is active, only show current agency results
            const matchesTenant = globalMode || !agencyId || r.routeType === 'mock' || true; // AnalysisResult doesn't have agencyId yet, need to add it or derive it
            
            return matchesDay && matchesTier && matchesSearch;
        });
    }, [analysisResults, activeDay, searchQuery, activeTiers, globalMode, agencyId]);

    const tierCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        analysisResults.filter(r => r.day === activeDay).forEach(r => {
            counts[r.tier] = (counts[r.tier] || 0) + 1;
        });
        return counts;
    }, [analysisResults, activeDay]);

    const toggleTier = (tier: string) => {
        const next = new Set(activeTiers);
        if (next.has(tier)) next.delete(tier);
        else next.add(tier);
        setActiveTiers(next);
    };

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        setLastFileName(file.name);
        setPendingFile(file);
        runAnalysis(file, async (data) => {
            await setRawData(data);
            addToast('GTFS analysis complete!', 'success');
        });
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px]">
                <div className="flex flex-col items-center space-y-4">
                    <div className="w-10 h-10 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
                    <div className="text-center">
                        <p className="text-[10px] text-[var(--text-muted)] font-bold mb-1">Analyzing feed</p>
                        <p className="text-xs font-mono text-indigo-400 font-bold">{status}</p>
                    </div>
                </div>
            </div>
        );
    }

    if (!isAuthenticated) {
        return (
            <ModuleLanding
                title="Analyze"
                description="Upload a GTFS feed to see how every route in your network performs. Routes are automatically grouped by headway into frequency tiers."
                icon={ShieldCheck}
                features={[
                    {
                        title: "Frequency tiers",
                        description: "Every route is categorized by its realized headway — from rapid (5 min) to infrequent (60 min).",
                        icon: <Clock className="w-5 h-5 text-indigo-500" />
                    },
                    {
                        title: "Corridor analysis",
                        description: "See combined frequency along shared corridors to find where multiple routes overlap.",
                        icon: <MapIcon className="w-5 h-5 text-indigo-500" />
                    },
                    {
                        title: "Reliability scoring",
                        description: "Each route gets a reliability score based on headway consistency throughout the day.",
                        icon: <Activity className="w-5 h-5 text-indigo-500" />
                    },
                    {
                        title: "Export and commit",
                        description: "Export results as CSV or commit routes to the Atlas catalog for network-wide visualization.",
                        icon: <Database className="w-5 h-5 text-indigo-500" />
                    }
                ]}
            />
        );
    }

    // Network mode — show cloud screener
    if (mode === 'network') {
        return (
            <div className="module-container">
                <NetworkScreener />
            </div>
        );
    }
}

// Dead local-mode code removed — Analyze is server-only now.
