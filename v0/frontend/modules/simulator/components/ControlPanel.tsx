import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SimulationParams, DEFAULT_PARAMS, StopOverride } from '../engine/simulationEngine';
import { Stop } from '../data/routeData';
import { Settings2, Save, X, RotateCcw, Gauge, Layers3, Zap, Timer, ChevronDown, ChevronRight } from 'lucide-react';

interface ControlPanelProps {
    params: SimulationParams;
    onParamsChange: (params: SimulationParams) => void;
    onToggleStop: (stopId: string) => void;
    stops: Stop[];
    enabledStopIds: Set<string>;
    onResetStops: () => void;
    onRemoveEveryOther: () => void;
    onClearNonTerminal: () => void;
    stopOverrides: Record<string, StopOverride>;
    onStopOverrideChange: (stopId: string, override: StopOverride | null) => void;
}

function Slider({
    label,
    value,
    min,
    max,
    step,
    unit,
    icon,
    onChange,
}: {
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    unit: string;
    icon?: React.ReactNode;
    onChange: (v: number) => void;
}) {
    return (
        <div className="group">
            <div className="flex justify-between items-center mb-2">
                <div className="flex items-center gap-2">
                    {icon && <span className="text-[var(--text-muted)] group-hover:text-indigo-500 transition-colors">{icon}</span>}
                    <label className="atlas-label">{label}</label>
                </div>
                <motion.span
                    key={value}
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="atlas-mono text-xs font-black text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-md"
                >
                    {value}{unit}
                </motion.span>
            </div>
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={(e) => onChange(Number(e.target.value))}
                className="w-full h-1.5 bg-[var(--border)] rounded-full appearance-none cursor-pointer accent-indigo-500 hover:accent-indigo-400 transition-all"
            />
            <div className="flex justify-between mt-1.5 text-[9px] font-bold text-[var(--text-muted)] tracking-tighter opacity-50">
                <span>{min}{unit}</span>
                <span>{max}{unit}</span>
            </div>
        </div>
    );
}

export default function ControlPanel({
    params,
    onParamsChange,
    onToggleStop,
    stops,
    enabledStopIds,
    onResetStops,
    onRemoveEveryOther,
    onClearNonTerminal,
    stopOverrides,
    onStopOverrideChange,
}: ControlPanelProps) {
    const [editingStopId, setEditingStopId] = useState<string | null>(null);
    const [editDwell, setEditDwell] = useState(params.dwellTimeSeconds);
    const [editAccel, setEditAccel] = useState(params.accelPenaltySeconds);
    const [engineOpen, setEngineOpen] = useState(true);
    const [inventoryOpen, setInventoryOpen] = useState(true);

    const nonTerminalStops = stops.filter(s => !s.isTerminal);
    const enabledNonTerminalCount = nonTerminalStops.filter(s => enabledStopIds.has(s.id)).length;

    const startEditing = (stop: Stop) => {
        const current = stopOverrides[stop.id];
        setEditDwell(current?.dwellTimeSeconds ?? params.dwellTimeSeconds);
        setEditAccel(current?.accelPenaltySeconds ?? params.accelPenaltySeconds);
        setEditingStopId(stop.id);
    };

    const saveOverride = () => {
        if (!editingStopId) return;
        onStopOverrideChange(editingStopId, {
            dwellTimeSeconds: editDwell,
            accelPenaltySeconds: editAccel
        });
        setEditingStopId(null);
    };

    const clearOverride = () => {
        if (!editingStopId) return;
        onStopOverrideChange(editingStopId, null);
        setEditingStopId(null);
    };

    return (
        <div className="flex flex-col gap-6 p-1">
            {/* Engine Parameters — Collapsible */}
            <div className="precision-panel overflow-hidden">
                <button
                    onClick={() => setEngineOpen(!engineOpen)}
                    className="w-full p-4 flex items-center justify-between hover:bg-[var(--item-bg)] transition-colors"
                >
                    <div className="flex items-center gap-2">
                        <Gauge className="w-3.5 h-3.5 text-indigo-500" />
                        <span className="atlas-label">Engine Parameters</span>
                    </div>
                    <motion.div animate={{ rotate: engineOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
                        <ChevronDown className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                    </motion.div>
                </button>
                <AnimatePresence>
                    {engineOpen && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
                            className="overflow-hidden"
                        >
                            <div className="px-5 pb-5 space-y-5 border-t border-[var(--border)]">
                                <div className="pt-4">
                                    <Slider
                                        label="Cruising Speed"
                                        value={params.baseSpeedKmh}
                                        min={10}
                                        max={40}
                                        step={1}
                                        unit=" km/h"
                                        icon={<Gauge className="w-3 h-3" />}
                                        onChange={(v) => onParamsChange({ ...params, baseSpeedKmh: v })}
                                    />
                                </div>
                                <Slider
                                    label="Dwell Time"
                                    value={params.dwellTimeSeconds}
                                    min={5}
                                    max={45}
                                    step={1}
                                    unit="s"
                                    icon={<Timer className="w-3 h-3" />}
                                    onChange={(v) => onParamsChange({ ...params, dwellTimeSeconds: v })}
                                />
                                <Slider
                                    label="Stop Penalty"
                                    value={params.accelPenaltySeconds}
                                    min={0}
                                    max={30}
                                    step={1}
                                    unit="s"
                                    icon={<Zap className="w-3 h-3" />}
                                    onChange={(v) => onParamsChange({ ...params, accelPenaltySeconds: v })}
                                />

                                <button
                                    onClick={() => onParamsChange(DEFAULT_PARAMS)}
                                    className="w-full btn-secondary justify-center text-[10px] py-2"
                                >
                                    Reset to Factory Model
                                </button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Strategic Scenarios */}
            <div className="precision-panel p-5">
                <div className="flex items-center gap-2 mb-4">
                    <Layers3 className="w-3.5 h-3.5 text-indigo-500" />
                    <h3 className="atlas-label">Strategic Scenarios</h3>
                </div>
                <div className="grid grid-cols-1 gap-2">
                    <button onClick={onResetStops} className="btn-primary w-full justify-center py-3 group">
                        <svg className="group-hover:rotate-180 transition-transform duration-500" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" /><path d="M3 21v-5h5" />
                        </svg>
                        Restore Baseline
                        <span className="ml-auto text-[9px] opacity-50 font-mono">R</span>
                    </button>
                    <div className="grid grid-cols-2 gap-2">
                        <button onClick={onRemoveEveryOther} className="btn-secondary w-full justify-center py-3 text-[10px]">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="10" /><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                            </svg>
                            Skip Stops
                            <span className="ml-auto text-[9px] opacity-40 font-mono">1</span>
                        </button>
                        <button onClick={onClearNonTerminal} className="btn-secondary w-full justify-center py-3 text-[10px]">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                            </svg>
                            Express
                            <span className="ml-auto text-[9px] opacity-40 font-mono">2</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* Stop Inventory — Collapsible */}
            <div className="precision-panel overflow-hidden">
                <button
                    onClick={() => setInventoryOpen(!inventoryOpen)}
                    className="w-full p-4 flex items-center justify-between hover:bg-[var(--item-bg)] transition-colors"
                >
                    <div className="flex items-center gap-2">
                        <span className="atlas-label">Stop Inventory</span>
                        <span className="atlas-label bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 px-2 py-0.5 rounded-full border border-indigo-500/20 text-[9px]">
                            {enabledNonTerminalCount} / {nonTerminalStops.length}
                        </span>
                    </div>
                    <motion.div animate={{ rotate: inventoryOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
                        <ChevronDown className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                    </motion.div>
                </button>
                <AnimatePresence>
                    {inventoryOpen && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
                            className="overflow-hidden"
                        >
                            <div className="space-y-1 max-h-[400px] overflow-y-auto px-3 pb-3 custom-scrollbar border-t border-[var(--border)] pt-2">
                                {stops.map((stop, idx) => {
                                    const isEnabled = enabledStopIds.has(stop.id);
                                    const hasOverride = !!stopOverrides[stop.id];
                                    const isEditing = editingStopId === stop.id;

                                    return (
                                        <motion.div
                                            key={stop.id}
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            transition={{ delay: idx * 0.01 }}
                                            className="flex flex-col gap-1"
                                        >
                                            <div
                                                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg border transition-all text-left ${isEnabled
                                                    ? 'bg-indigo-500/5 border-indigo-500/20 text-[var(--fg)]'
                                                    : 'bg-transparent border-transparent text-[var(--text-muted)] grayscale opacity-50'
                                                    } ${stop.isTerminal ? 'ring-1 ring-amber-500/30' : 'hover:border-[var(--border-hover)]'}`}
                                            >
                                                <div className="flex items-center gap-3 cursor-pointer flex-grow" onClick={() => !stop.isTerminal && onToggleStop(stop.id)}>
                                                    <div className={`w-1.5 h-1.5 rounded-full transition-all ${isEnabled ? 'bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.3)]' : 'bg-[var(--border)]'}`} />
                                                    <div className="flex flex-col">
                                                        <span className={`text-[10px] font-bold truncate max-w-[140px] tracking-tight ${isEnabled ? 'text-[var(--fg)]' : 'text-[var(--text-muted)] line-through'}`}>{stop.name}</span>
                                                        {hasOverride && isEnabled && (
                                                            <span className="text-[8px] text-indigo-600 dark:text-indigo-400 font-bold">Customized</span>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    {isEnabled && !stop.isTerminal && (
                                                        <button
                                                            onClick={() => isEditing ? setEditingStopId(null) : startEditing(stop)}
                                                            className={`p-1.5 rounded-md hover:bg-white/10 transition-colors ${hasOverride ? 'text-indigo-400' : 'text-[var(--text-muted)]'}`}
                                                        >
                                                            <Settings2 className="w-3 h-3" />
                                                        </button>
                                                    )}
                                                    {stop.isTerminal && (
                                                        <span className="text-[8px] font-black bg-amber-500/10 text-amber-500 px-1.5 py-0.5 rounded tracking-tighter border border-amber-500/20">Terminal</span>
                                                    )}
                                                </div>
                                            </div>

                                            <AnimatePresence>
                                                {isEditing && (
                                                    <motion.div
                                                        initial={{ height: 0, opacity: 0 }}
                                                        animate={{ height: 'auto', opacity: 1 }}
                                                        exit={{ height: 0, opacity: 0 }}
                                                        transition={{ duration: 0.15 }}
                                                        className="overflow-hidden"
                                                    >
                                                        <div className="mx-1 px-4 py-4 bg-[var(--item-bg)] border border-indigo-500/20 rounded-xl space-y-4 mb-3">
                                                            <div>
                                                                <div className="flex justify-between text-[9px] font-bold text-[var(--text-muted)] mb-2 tracking-wider">
                                                                    <span>Dwell Time</span>
                                                                    <span className="atlas-mono text-indigo-600 dark:text-indigo-400">{editDwell}s</span>
                                                                </div>
                                                                <input
                                                                    type="range" min="5" max="60" step="1"
                                                                    value={editDwell}
                                                                    onChange={(e) => setEditDwell(Number(e.target.value))}
                                                                    className="w-full h-1 bg-[var(--border)] rounded-full appearance-none accent-indigo-500"
                                                                />
                                                            </div>
                                                            <div>
                                                                <div className="flex justify-between text-[9px] font-bold text-[var(--text-muted)] mb-2 tracking-wider">
                                                                    <span>Penalty</span>
                                                                    <span className="atlas-mono text-indigo-600 dark:text-indigo-400">{editAccel}s</span>
                                                                </div>
                                                                <input
                                                                    type="range" min="0" max="45" step="1"
                                                                    value={editAccel}
                                                                    onChange={(e) => setEditAccel(Number(e.target.value))}
                                                                    className="w-full h-1 bg-[var(--border)] rounded-full appearance-none accent-indigo-500"
                                                                />
                                                            </div>
                                                            <div className="flex gap-2 pt-1">
                                                                <button onClick={saveOverride} className="flex-grow py-2 bg-indigo-600 dark:bg-indigo-500 text-white text-[9px] font-bold rounded-lg flex items-center justify-center gap-2 hover:opacity-90 transition-all shadow-sm">
                                                                    <Save className="w-3 h-3" /> Save changes
                                                                </button>
                                                                <button onClick={clearOverride} className="px-3 py-2 bg-[var(--bg)] border border-[var(--border)] text-[var(--text-muted)] text-[9px] font-bold rounded-lg hover:bg-[var(--item-hover)] transition-all">
                                                                    <X className="w-3 h-3" />
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </motion.div>
                                    );
                                })}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}
