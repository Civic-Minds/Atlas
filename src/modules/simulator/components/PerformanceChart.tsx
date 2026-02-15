import React, { useMemo, useState } from 'react';
import { HourlyPerformance } from '../data/tripPerformance';

interface PerformanceChartProps {
    data: HourlyPerformance[];
    currentSimSeconds: number;
    routeColor: string;
}

export default function PerformanceChart({ data, currentSimSeconds, routeColor }: PerformanceChartProps) {
    const [hoveredHour, setHoveredHour] = useState<number | null>(null);

    const width = 400;
    const height = 150;
    const padding = { top: 10, right: 10, bottom: 25, left: 40 };

    const maxVal = useMemo(() => {
        return Math.max(...data.map(d => Math.max(d.actualTimeSeconds, d.scheduledTimeSeconds)), currentSimSeconds) * 1.1;
    }, [data, currentSimSeconds]);

    const xScale = (hour: number) => (hour / 23) * (width - padding.left - padding.right) + padding.left;
    const yScale = (value: number) => height - padding.bottom - (value / maxVal) * (height - padding.top - padding.bottom);

    // Generate paths
    const actualPath = useMemo(() => {
        return data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xScale(d.hour)} ${yScale(d.actualTimeSeconds)}`).join(' ');
    }, [data, maxVal]);

    const scheduledPath = useMemo(() => {
        return data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xScale(d.hour)} ${yScale(d.scheduledTimeSeconds)}`).join(' ');
    }, [data, maxVal]);

    const actualArea = useMemo(() => {
        return `${actualPath} L ${xScale(23)} ${yScale(0)} L ${xScale(0)} ${yScale(0)} Z`;
    }, [actualPath]);

    // Current Simulation Level
    const simY = yScale(currentSimSeconds);

    const hoveredData = useMemo(() => {
        if (hoveredHour === null) return null;
        return data.find(d => d.hour === hoveredHour) || null;
    }, [hoveredHour, data]);

    return (
        <div className="precision-panel p-6 mt-6">
            <div className="flex justify-between items-center mb-6">
                <h4 className="atlas-label">
                    24h Performance Analysis
                </h4>
                <div className="flex gap-4 atlas-label">
                    <span className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-sm" style={{ background: routeColor, opacity: 0.6 }}></span>
                        Actual
                    </span>
                    <span className="flex items-center gap-2">
                        <span className="w-2 h-px bg-[var(--text-muted)] opacity-40"></span>
                        Scheduled
                    </span>
                </div>
            </div>

            <svg
                width="100%"
                height={height}
                viewBox={`0 0 ${width} ${height}`}
                className="overflow-visible"
                onMouseMove={(e) => {
                    const svg = e.currentTarget;
                    const rect = svg.getBoundingClientRect();
                    const x = ((e.clientX - rect.left) / rect.width) * width;

                    // Find closest hour
                    let bestHour = 0;
                    let minDist = Infinity;
                    data.forEach(d => {
                        const dist = Math.abs(xScale(d.hour) - x);
                        if (dist < minDist) {
                            minDist = dist;
                            bestHour = d.hour;
                        }
                    });

                    if (minDist < 30) {
                        setHoveredHour(bestHour);
                    } else {
                        setHoveredHour(null);
                    }
                }}
                onMouseLeave={() => setHoveredHour(null)}
                style={{ touchAction: 'none' }}
            >
                {/* Hit Area */}
                <rect width={width} height={height} fill="transparent" pointerEvents="all" />
                {/* Y-Axis Grid */}
                {[0, 0.5, 1].map(p => (
                    <g key={p}>
                        <line
                            x1={padding.left}
                            y1={yScale(maxVal * p * 0.9)}
                            x2={width - padding.right}
                            y2={yScale(maxVal * p * 0.9)}
                            className="stroke-[var(--border)]"
                            strokeWidth="1"
                        />
                        <text
                            x={padding.left - 10}
                            y={yScale(maxVal * p * 0.9)}
                            className="fill-[var(--text-muted)] font-mono text-[9px]"
                            textAnchor="end"
                            alignmentBaseline="middle"
                        >
                            {Math.round((maxVal * p * 0.9) / 60)}m
                        </text>
                    </g>
                ))}

                {/* X-Axis Labels */}
                {[0, 6, 12, 18, 23].map(h => (
                    <text
                        key={h}
                        x={xScale(h)}
                        y={height - 5}
                        className="fill-[var(--text-muted)] font-mono text-[9px]"
                        textAnchor="middle"
                    >
                        {h === 0 ? '12am' : h < 12 ? `${h}am` : h === 12 ? '12pm' : `${h - 12}pm`}
                    </text>
                ))}

                {/* Area and Lines */}
                <path d={actualArea} fill={routeColor} fillOpacity="0.05" />
                <path d={actualPath} fill="none" stroke={routeColor} strokeWidth="2" strokeOpacity="0.7" strokeLinecap="round" strokeLinejoin="round" />
                <path d={scheduledPath} fill="none" stroke="var(--fg)" strokeWidth="1" strokeDasharray="4 2" strokeOpacity="0.1" />

                {/* User Simulation Level */}
                <line
                    x1={padding.left}
                    y1={simY}
                    x2={width - padding.right}
                    y2={simY}
                    className="stroke-indigo-500 dark:stroke-indigo-400"
                    strokeWidth="1.5"
                    strokeDasharray="2 2"
                />
                {!hoveredHour && (
                    <text
                        x={width - padding.right}
                        y={simY - 8}
                        className="fill-indigo-600 dark:fill-indigo-400 font-mono text-[10px] font-bold"
                        textAnchor="end"
                    >
                        Config: {Math.round(currentSimSeconds / 60)}m
                    </text>
                )}

                {/* Vertical Guideline */}
                {hoveredHour !== null && (
                    <line
                        x1={xScale(hoveredHour)}
                        y1={padding.top}
                        x2={xScale(hoveredHour)}
                        y2={height - padding.bottom}
                        stroke="var(--border)"
                        strokeWidth="1"
                        strokeDasharray="4 4"
                        pointerEvents="none"
                    />
                )}

                {/* Tooltip */}
                {hoveredHour !== null && hoveredData && (
                    <g transform={`translate(${xScale(hoveredHour)}, ${yScale(hoveredData.actualTimeSeconds) - 10})`} style={{ pointerEvents: 'none' }}>
                        <rect
                            x="-55"
                            y="-75"
                            width="110"
                            height="65"
                            rx="8"
                            className="fill-[var(--card)] stroke-[var(--border)]"
                            strokeWidth="1.5"
                            style={{ filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.1))' }}
                        />
                        <text y="-58" textAnchor="middle" className="fill-[var(--text-muted)] font-mono text-[9px] font-bold tracking-wider">
                            {hoveredHour === 0 ? '12:00 am' : hoveredHour < 12 ? `${hoveredHour}:00 am` : hoveredHour === 12 ? '12:00 pm' : `${hoveredHour - 12}:00 pm`}
                        </text>

                        {/* Actual Row */}
                        <g transform="translate(0, -42)">
                            <circle r="3" fill={routeColor} cx="-40" />
                            <text x="-32" textAnchor="start" className="fill-[var(--fg)] font-mono text-[10px] font-bold">
                                Act: {Math.round(hoveredData.actualTimeSeconds / 60)}m {hoveredData.actualTimeSeconds % 60}s
                            </text>
                        </g>

                        {/* Scheduled Row */}
                        <g transform="translate(0, -28)">
                            <circle r="3" fill="var(--fg)" fillOpacity="0.2" cx="-40" />
                            <text x="-32" textAnchor="start" className="fill-[var(--text-muted)] font-mono text-[10px]">
                                Sch: {Math.round(hoveredData.scheduledTimeSeconds / 60)}m {hoveredData.scheduledTimeSeconds % 60}s
                            </text>
                        </g>

                        {/* Delay / Difference */}
                        <text y="-14" textAnchor="middle" className={`font-mono text-[9px] font-bold ${hoveredData.actualTimeSeconds > hoveredData.scheduledTimeSeconds ? 'fill-red-500' : 'fill-emerald-500'}`}>
                            {hoveredData.actualTimeSeconds > hoveredData.scheduledTimeSeconds
                                ? `Delay: +${Math.round((hoveredData.actualTimeSeconds - hoveredData.scheduledTimeSeconds))}s`
                                : hoveredData.actualTimeSeconds < hoveredData.scheduledTimeSeconds
                                    ? `Saved: ${Math.round((hoveredData.scheduledTimeSeconds - hoveredData.actualTimeSeconds))}s`
                                    : 'On time'}
                        </text>

                        <circle r="4" fill={routeColor} stroke="var(--bg)" strokeWidth="2" />
                    </g>
                )}
            </svg>
        </div>
    );
}
