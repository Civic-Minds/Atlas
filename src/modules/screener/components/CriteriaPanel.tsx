import React, { useState, useEffect } from 'react';
import { Settings2, Save, RotateCcw } from 'lucide-react';
import { useTransitStore } from '../../../types/store';
import { DEFAULT_CRITERIA } from '../../../core/defaults';

export const CriteriaPanel: React.FC = () => {
    const { activeCriteria, setCriteria } = useTransitStore();
    const [isOpen, setIsOpen] = useState(false);
    const [startMin, setStartMin] = useState(420); // 7:00
    const [endMin, setEndMin] = useState(1320); // 22:00
    const [graceMinutes, setGraceMinutes] = useState(5);
    const [maxGraceViolations, setMaxGraceViolations] = useState(2);

    // Sync local state when activeCriteria changes
    useEffect(() => {
        setStartMin(activeCriteria.dayTypes.Weekday?.timeWindow.start || 420);
        setEndMin(activeCriteria.dayTypes.Weekday?.timeWindow.end || 1320);
        setGraceMinutes(activeCriteria.graceMinutes || 5);
        setMaxGraceViolations(activeCriteria.maxGraceViolations || 2);
    }, [activeCriteria]);

    const formatTime = (mins: number) => {
        const h = Math.floor(mins / 60).toString().padStart(2, '0');
        const m = (mins % 60).toString().padStart(2, '0');
        return `${h}:${m}`;
    };

    const parseTime = (time: string) => {
        const [h, m] = time.split(':').map(Number);
        return h * 60 + m;
    };

    const handleSave = () => {
        // Need to explicitly cast as AnalysisCriteria matching the type structure
        const newCriteria = {
            ...activeCriteria,
            graceMinutes,
            maxGraceViolations,
            dayTypes: {
                ...activeCriteria.dayTypes,
                ...(activeCriteria.dayTypes.Weekday ? {
                    Weekday: {
                        ...activeCriteria.dayTypes.Weekday,
                        timeWindow: { start: startMin, end: endMin }
                    }
                } : {}),
                ...(activeCriteria.dayTypes.Saturday ? {
                    Saturday: {
                        ...activeCriteria.dayTypes.Saturday,
                        timeWindow: { start: startMin, end: endMin }
                    }
                } : {}),
                ...(activeCriteria.dayTypes.Sunday ? {
                    Sunday: {
                        ...activeCriteria.dayTypes.Sunday,
                        timeWindow: { start: startMin, end: endMin }
                    }
                } : {})
            }
        };
        setCriteria(newCriteria as any);
        setIsOpen(false);
    };

    const handleReset = () => {
        setCriteria(DEFAULT_CRITERIA);
    };

    if (!isOpen) {
        return (
            <button 
                onClick={() => setIsOpen(true)}
                className="flex items-center gap-2 px-4 py-2 bg-[var(--item-bg)] border border-[var(--border)] rounded-lg text-xs font-bold hover:border-indigo-500 transition-colors h-fit"
            >
                <Settings2 className="w-4 h-4" /> Criteria
            </button>
        );
    }

    return (
        <div className="precision-panel p-6 mb-6 border-indigo-500/30 shadow-[0_0_15px_rgba(99,102,241,0.1)] w-full">
            <div className="flex items-center justify-between mb-4 pb-4 border-b border-[var(--border)]">
                <h3 className="font-bold flex items-center gap-2 text-[var(--fg)]">
                    <Settings2 className="w-4 h-4 text-indigo-500" />
                    Analysis Criteria
                </h3>
                <button onClick={() => setIsOpen(false)} className="text-[var(--text-muted)] hover:text-[var(--fg)] text-xs font-bold transition-colors">
                    Close
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
                <div>
                    <label className="atlas-label text-[9px] mb-2 block">Window Start</label>
                    <input 
                        type="time" 
                        value={formatTime(startMin)}
                        onChange={(e) => setStartMin(parseTime(e.target.value))}
                        className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm font-bold text-[var(--fg)] focus:border-indigo-500 outline-none"
                    />
                </div>
                <div>
                    <label className="atlas-label text-[9px] mb-2 block">Window End</label>
                    <input 
                        type="time" 
                        value={formatTime(endMin)}
                        onChange={(e) => setEndMin(parseTime(e.target.value))}
                        className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm font-bold text-[var(--fg)] focus:border-indigo-500 outline-none"
                    />
                </div>
                <div>
                    <label className="atlas-label text-[9px] mb-2 block">Grace Minutes</label>
                    <input 
                        type="number" 
                        min="0"
                        value={graceMinutes}
                        onChange={(e) => setGraceMinutes(Number(e.target.value))}
                        className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm font-bold text-[var(--fg)] focus:border-indigo-500 outline-none"
                    />
                </div>
                <div>
                    <label className="atlas-label text-[9px] mb-2 block">Max Violations</label>
                    <input 
                        type="number" 
                        min="0"
                        value={maxGraceViolations}
                        onChange={(e) => setMaxGraceViolations(Number(e.target.value))}
                        className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm font-bold text-[var(--fg)] focus:border-indigo-500 outline-none"
                    />
                </div>
            </div>

            <div className="flex items-center gap-4">
                <button 
                    onClick={handleSave}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-500 text-white rounded-lg text-xs font-bold hover:bg-indigo-600 transition-colors"
                >
                    <Save className="w-4 h-4" /> Apply Changes
                </button>
                <button 
                    onClick={handleReset}
                    className="flex items-center gap-2 px-4 py-2 bg-[var(--bg)] border border-[var(--border)] rounded-lg text-xs font-bold hover:text-red-500 transition-colors text-[var(--text-muted)]"
                >
                    <RotateCcw className="w-4 h-4" /> Reset to Defaults
                </button>
            </div>
        </div>
    );
};