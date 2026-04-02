import React from 'react';
import {
    Target,
    Activity,
    ArrowRight,
    TrendingUp,
    Zap,
    FileCheck,
    Globe
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const MODULES = [
    {
        id: 'strategy',
        title: 'Strategy',
        description: 'Analyze your GTFS feed to see frequency tiers, route performance, and network-wide headway statistics.',
        icon: <Target className="w-4 h-4" />,
        path: '/strategy',
    },
    {
        id: 'optimize',
        title: 'Optimize',
        description: 'See your entire network on a map, colored by service frequency. Filter by tier, day, and agency.',
        icon: <Globe className="w-4 h-4" />,
        path: '/optimize',
    },
    {
        id: 'predict',
        title: 'Predict',
        description: 'Find transit deserts by comparing population density against service coverage in your network.',
        icon: <TrendingUp className="w-4 h-4" />,
        path: '/predict',
    },
    {
        id: 'simulate',
        title: 'Simulate',
        description: 'Model stop consolidation scenarios. Toggle stops on and off to see the travel time impact.',
        icon: <Activity className="w-4 h-4" />,
        path: '/simulate',
    },
    {
        id: 'audit',
        title: 'Audit',
        description: 'Verify frequency analysis against real agency schedules in a side-by-side review.',
        icon: <FileCheck className="w-4 h-4" />,
        path: '/audit',
    },
];

const HomePage: React.FC = () => {
    const navigate = useNavigate();

    return (
        <div className="flex-1 overflow-y-auto">
            <div className="px-8 py-10 max-w-5xl mx-auto w-full">
                <div className="mb-10">
                    <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)] mb-2">
                        Atlas
                    </h1>
                    <p className="text-sm text-[var(--text-muted)]">
                        Transit intelligence platform by Civic Minds
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {MODULES.map((mod) => (
                        <button
                            key={mod.id}
                            onClick={() => navigate(mod.path)}
                            className="group flex items-start gap-4 p-5 rounded-lg border border-[var(--border)] bg-[var(--bg)] hover:border-indigo-500/40 hover:bg-[var(--item-bg)] transition-colors text-left"
                        >
                            <div className="w-9 h-9 rounded-lg bg-[var(--item-bg)] border border-[var(--border)] flex items-center justify-center text-[var(--text-muted)] group-hover:text-indigo-500 transition-colors flex-shrink-0">
                                {mod.icon}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between mb-1">
                                    <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                                        {mod.title}
                                    </h3>
                                    <ArrowRight className="w-3.5 h-3.5 text-[var(--text-muted)] opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                                </div>
                                <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                                    {mod.description}
                                </p>
                            </div>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default HomePage;
