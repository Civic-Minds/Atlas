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
    const height = 160;
    const padding = { top: 15, right: 15, bottom: 28, left: 42 };

    const maxVal = useMemo(() => {
        return Math.max(...data.map(d => Math.max(d.actualTimeSeconds, d.scheduledTimeSeconds)), currentSimSeconds) * 1.1;
    }, [data, currentSimSeconds]);

    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    const xScale = (hour: number) => (hour / 23) * chartW + padding.left;
    const yScale = (value: number) => height - padding.bottom - (value / maxVal) * chartH;

    // Smooth curve generation using cardinal spline
    const toSmoothPath = (points: { x: number; y: number }[], tension = 0.3) => {
        if (points.length < 2) return '';
        let d = `M ${points[0].x} ${points[0].y}`;
        for (let i = 0; i < points.length - 1; i++) {
            const p0 = points[Math.max(0, i - 1)];
            const p1 = points[i];
            const p2 = points[i + 1];
            const p3 = points[Math.min(points.length - 1, i + 2)];
            const cp1x = p1.x + (p2.x - p0.x) * tension;
            const cp1y = p1.y + (p2.y - p0.y) * tension;
            const cp2x = p2.x - (p3.x - p1.x) * tension;
            const cp2y = p2.y - (p3.y - p1.y) * tension;
            d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
        }
        return d;
    };

    const actualPoints = useMemo(() =>
        data.map(d => ({ x: xScale(d.hour), y: yScale(d.actualTimeSeconds) })),
        [data, maxVal]
    );

    const scheduledPoints = useMemo(() =>
        data.map(d => ({ x: xScale(d.hour), y: yScale(d.scheduledTimeSeconds) })),
        [data, maxVal]
    );

    const actualPath = useMemo(() => toSmoothPath(actualPoints), [actualPoints]);
    const scheduledPath = useMemo(() => toSmoothPath(scheduledPoints), [scheduledPoints]);

    const actualArea = useMemo(() => {
        if (actualPoints.length === 0) return '';
        return `${actualPath} L ${actualPoints[actualPoints.length - 1].x} ${yScale(0)} L ${actualPoints[0].x} ${yScale(0)} Z`;
    }, [actualPath, actualPoints]);

    const simY = yScale(currentSimSeconds);

    const hoveredData = useMemo(() => {
        if (hoveredHour === null) return null;
        return data.find(d => d.hour === hoveredHour) || null;
    }, [hoveredHour, data]);

    const gradientId = `actual-gradient-${routeColor.replace('#', '')}`;
    const glowId = `glow-${routeColor.replace('#', '')}`;

    return (
        <div className="precision-panel p-5 mt-6">
            <div className="flex justify-between items-center mb-4">
                <h4 className="atlas-label">
                    24h Performance Model
                </h4>
                <div className="flex gap-4 atlas-label text-[9px]">
                    <span className="flex items-center gap-1.5">
                        <span className="w-3 h-0.5 rounded-full" style={{ background: routeColor }}></span>
                        Real-World
                    </span>
                    <span className="flex items-center gap-1.5">
                        <span className="w-3 h-px bg-[var(--text-muted)] opacity-40"></span>
                        Scheduled
                    </span>
                    <span className="flex items-center gap-1.5">
                        <span className="w-3 h-0.5 rounded-full bg-indigo-500"></span>
                        Your Config
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
                    let bestHour = 0;
                    let minDist = Infinity;
                    data.forEach(d => {
                        const dist = Math.abs(xScale(d.hour) - x);
                        if (dist < minDist) { minDist = dist; bestHour = d.hour; }
                    });
                    setHoveredHour(minDist < 30 ? bestHour : null);
                }}
                onMouseLeave={() => setHoveredHour(null)}
                style={{ touchAction: 'none' }}
            >
                <defs>
                    {/* Gradient fill under the actual curve */}
                    <linearGradient id={gradientId} x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor={routeColor} stopOpacity="0.15" />
                        <stop offset="100%" stopColor={routeColor} stopOpacity="0" />
                    </linearGradient>
                    {/* Glow filter for the simulation line */}
                    <filter id={glowId} x="-20%" y="-20%" width="140%" height="140%">
                        <feGaussianBlur stdDeviation="2" result="blur" />
                        <feMerge>
                            <feMergeNode in="blur" />
                            <feMergeNode in="SourceGraphic" />
                        </feMerge>
                    </filter>
                </defs>

                {/* Hit Area */}
                <rect width={width} height={height} fill="transparent" pointerEvents="all" />

                {/* Y-Axis Grid */}
                {[0, 0.25, 0.5, 0.75, 1].map(p => (
                    <g key={p}>
                        <line
                            x1={padding.left}
                            y1={yScale(maxVal * p * 0.9)}
                            x2={width - padding.right}
                            y2={yScale(maxVal * p * 0.9)}
                            className="stroke-[var(--border)]"
                            strokeWidth="0.5"
                            strokeDasharray="2 4"
                        />
                        {p > 0 && (
                            <text
                                x={padding.left - 8}
                                y={yScale(maxVal * p * 0.9)}
                                className="fill-[var(--text-muted)] font-mono text-[8px]"
                                textAnchor="end"
                                alignmentBaseline="middle"
                            >
                                {Math.round((maxVal * p * 0.9) / 60)}m
                            </text>
                        )}
                    </g>
                ))}

                {/* X-Axis Labels */}
                {[0, 6, 12, 18, 23].map(h => (
                    <text
                        key={h}
                        x={xScale(h)}
                        y={height - 8}
                        className="fill-[var(--text-muted)] font-mono text-[8px]"
                        textAnchor="middle"
                    >
                        {h === 0 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h - 12}p`}
                    </text>
                ))}

                {/* Gradient area under actual line */}
                <path d={actualArea} fill={`url(#${gradientId})`} />

                {/* Scheduled line (faint) */}
                <path d={scheduledPath} fill="none" stroke="var(--fg)" strokeWidth="1" strokeDasharray="3 3" strokeOpacity="0.08" />

                {/* Actual line (smooth) */}
                <path d={actualPath} fill="none" stroke={routeColor} strokeWidth="2" strokeOpacity="0.8" strokeLinecap="round" strokeLinejoin="round" />

                {/* User Simulation Level */}
                <line
                    x1={padding.left}
                    y1={simY}
                    x2={width - padding.right}
                    y2={simY}
                    stroke="#6366F1"
                    strokeWidth="1.5"
                    strokeDasharray="4 3"
                    filter={`url(#${glowId})`}
                    strokeOpacity="0.7"
                />
                {!hoveredHour && (
                    <g>
                        <rect
                            x={width - padding.right - 60}
                            y={simY - 16}
                            width="55"
                            height="14"
                            rx="4"
                            fill="#6366F1"
                            fillOpacity="0.15"
                        />
                        <text
                            x={width - padding.right - 33}
                            y={simY - 7}
                            className="fill-indigo-500 font-mono text-[8px] font-bold"
                            textAnchor="middle"
                        >
                            You: {Math.round(currentSimSeconds / 60)}m
                        </text>
                    </g>
                )}

                {/* Vertical Guideline */}
                {hoveredHour !== null && (
                    <line
                        x1={xScale(hoveredHour)}
                        y1={padding.top}
                        x2={xScale(hoveredHour)}
                        y2={height - padding.bottom}
                        stroke="var(--border-strong)"
                        strokeWidth="1"
                        strokeDasharray="2 2"
                        pointerEvents="none"
                    />
                )}

                {/* Tooltip */}
                {hoveredHour !== null && hoveredData && (
                    <g transform={`translate(${xScale(hoveredHour)}, ${yScale(hoveredData.actualTimeSeconds) - 10})`} style={{ pointerEvents: 'none' }}>
                        <rect
                            x="-58"
                            y="-78"
                            width="116"
                            height="68"
                            rx="10"
                            className="fill-[var(--card)] stroke-[var(--border)]"
                            strokeWidth="1"
                            style={{ filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.12))' }}
                        />

                        {/* Time label */}
                        <text y="-60" textAnchor="middle" className="fill-[var(--text-muted)] font-mono text-[8px] font-bold tracking-wider">
                            {hoveredHour === 0 ? '12:00 AM' : hoveredHour < 12 ? `${hoveredHour}:00 AM` : hoveredHour === 12 ? '12:00 PM' : `${hoveredHour - 12}:00 PM`}
                        </text>

                        {/* Actual Row */}
                        <g transform="translate(0, -44)">
                            <circle r="3" fill={routeColor} cx="-42" />
                            <text x="-34" textAnchor="start" className="fill-[var(--fg)] font-mono text-[9px] font-bold">
                                Real: {Math.round(hoveredData.actualTimeSeconds / 60)}m {Math.round(hoveredData.actualTimeSeconds % 60)}s
                            </text>
                        </g>

                        {/* Scheduled Row */}
                        <g transform="translate(0, -30)">
                            <circle r="3" fill="var(--fg)" fillOpacity="0.15" cx="-42" />
                            <text x="-34" textAnchor="start" className="fill-[var(--text-muted)] font-mono text-[9px]">
                                Sch: {Math.round(hoveredData.scheduledTimeSeconds / 60)}m {Math.round(hoveredData.scheduledTimeSeconds % 60)}s
                            </text>
                        </g>

                        {/* Delay indicator */}
                        <text y="-16" textAnchor="middle" className={`font-mono text-[8px] font-black ${hoveredData.actualTimeSeconds > hoveredData.scheduledTimeSeconds ? 'fill-red-500' : 'fill-emerald-500'}`}>
                            {hoveredData.actualTimeSeconds > hoveredData.scheduledTimeSeconds
                                ? `+${Math.round(hoveredData.actualTimeSeconds - hoveredData.scheduledTimeSeconds)}s delay`
                                : hoveredData.actualTimeSeconds < hoveredData.scheduledTimeSeconds
                                    ? `−${Math.round(hoveredData.scheduledTimeSeconds - hoveredData.actualTimeSeconds)}s ahead`
                                    : 'On time'}
                        </text>

                        <circle r="4.5" fill={routeColor} stroke="var(--bg)" strokeWidth="2.5" />
                    </g>
                )}
            </svg>
        </div>
    );
}
