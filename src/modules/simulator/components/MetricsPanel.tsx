import React from 'react';
import { SimulationResult } from '../engine/simulationEngine';
import { SimulationParams } from '../engine/simulationEngine';
import PerformanceChart from './PerformanceChart';
import { ROUTE_PERFORMANCE_DATA } from '../data/tripPerformance';

interface MetricsPanelProps {
    result: SimulationResult;
    baselineResult: SimulationResult;
    params: SimulationParams;
    routeId: string;
    routeColor: string;
}

function MetricCard({
    label,
    value,
    baseline,
    type = 'neutral',
    icon
}: {
    label: string;
    value: string;
    baseline?: string;
    type?: 'positive' | 'negative' | 'neutral';
    icon?: React.ReactNode;
}) {
    const typeStyles = {
        positive: 'border-emerald-500/20 bg-emerald-500/5',
        negative: 'border-red-500/20 bg-red-500/5',
        neutral: 'border-[var(--border)] bg-[var(--card)]'
    };

    const valueStyles = {
        positive: 'text-emerald-600 dark:text-emerald-400',
        negative: 'text-red-600 dark:text-red-400',
        neutral: 'text-[var(--fg)]'
    };

    return (
        <div className={`p-4 rounded-xl border transition-all box-shadow-soft ${typeStyles[type]}`}>
            <div className="flex justify-between items-start mb-3">
                <span className="atlas-label">{label}</span>
                <div className={`p-1.5 rounded-lg bg-[var(--item-bg)] border border-[var(--border)] ${valueStyles[type]}`}>
                    {icon}
                </div>
            </div>
            <div className={`text-xl font-black tracking-tight atlas-mono ${valueStyles[type]}`}>{value}</div>
            {baseline && (
                <div className="mt-2 atlas-label flex items-center gap-1.5 normal-case">
                    <span className="w-1 h-1 rounded-full bg-[var(--border)]" />
                    {baseline}
                </div>
            )}
        </div>
    );
}

export default function MetricsPanel({ result, baselineResult, routeId, routeColor }: MetricsPanelProps) {
    const timeDiff = baselineResult.totalTimeSeconds - result.totalTimeSeconds;
    const isTimeSaved = timeDiff > 0;

    const speedDiff = result.averageSpeedKmh - baselineResult.averageSpeedKmh;
    const isSpeedBetter = speedDiff > 0;

    const performanceData = ROUTE_PERFORMANCE_DATA[routeId] || [];
    const maxActual = performanceData.length > 0 ? Math.max(...performanceData.map(d => d.actualTimeSeconds)) : 0;
    const minActual = performanceData.length > 0 ? Math.min(...performanceData.map(d => d.actualTimeSeconds)) : 0;
    const congestionCost = maxActual - minActual;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between mb-2">
                <h2 className="atlas-label">Core Metrics</h2>
                <div className="h-px flex-1 mx-4 bg-[var(--border)]" />
            </div>

            <div className="grid grid-cols-2 gap-3">
                <MetricCard
                    label="Travel Time"
                    value={result.formattedTime}
                    baseline={`${baselineResult.formattedTime} Baseline`}
                    type={isTimeSaved ? 'positive' : 'neutral'}
                    icon={
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                        </svg>
                    }
                />
                <MetricCard
                    label="Avg Speed"
                    value={`${result.averageSpeedKmh.toFixed(1)} km/h`}
                    baseline={`${baselineResult.averageSpeedKmh.toFixed(1)} km/h`}
                    type={isSpeedBetter ? 'positive' : 'neutral'}
                    icon={
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                        </svg>
                    }
                />
                <MetricCard
                    label="Stops Optimized"
                    value={result.stopsRemoved.toString()}
                    baseline={result.stopsRemoved > 0 ? `${Math.round((result.stopsRemoved / baselineResult.numberOfStops) * 100)}% Reduction` : 'No Changes'}
                    type={result.stopsRemoved > 0 ? 'positive' : 'neutral'}
                    icon={
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M20 6L9 17l-5-5" />
                        </svg>
                    }
                />
                <MetricCard
                    label="Congestion"
                    value={`${Math.round(congestionCost / 60)}m Cost`}
                    baseline="Variance (Peak/Off)"
                    type="negative"
                    icon={
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                        </svg>
                    }
                />
            </div>

            <PerformanceChart
                data={performanceData}
                currentSimSeconds={result.totalTimeSeconds}
                routeColor={routeColor}
            />
        </div>
    );
}
