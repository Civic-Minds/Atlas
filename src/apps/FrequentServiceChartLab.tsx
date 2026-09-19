import { useState } from 'react';
import audit from '../../docs/research/system-map-audit-2026-09.json';

const thresholds = [10, 12, 15, 20, 30];
const records = audit.records.filter(record => record.country === 'Canada' || record.country === 'United States');
const numericRecords = records
  .filter(record => Number.isInteger(record.representativeThresholdMinutes))
  .sort((a, b) => (a.representativeThresholdMinutes ?? 0) - (b.representativeThresholdMinutes ?? 0));

export default function FrequentServiceChartLab() {
  const [country, setCountry] = useState<'All' | 'Canada' | 'United States'>('All');
  const [selectedMinutes, setSelectedMinutes] = useState<number | null>(null);
  const [hoveredAgency, setHoveredAgency] = useState<string | null>(null);
  const visibleRecords = country === 'All' ? numericRecords : numericRecords.filter(record => record.country === country);
  const counts = thresholds.map(minutes => visibleRecords.filter(record => record.representativeThresholdMinutes === minutes).length);
  const maxCount = Math.max(...counts, 1);

  return (
    <main className="h-full overflow-y-auto bg-[var(--bg-app)] px-5 pb-24 pt-28 text-[var(--text-primary)] sm:px-10">
      <div className="mx-auto max-w-6xl">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-[var(--accent)]">Research chart lab</p>
        <h1 className="mt-4 max-w-3xl text-4xl font-black tracking-[-0.04em] sm:text-6xl">What do agencies actually call frequent?</h1>
        <p className="mt-5 max-w-2xl text-base leading-8 text-[var(--text-muted)]">One dot is one reviewed agency. The dots are grouped by the agency’s representative published frequency definition, so the clusters show where the definitions actually land.</p>

        <section className="mt-12 rounded-[2rem] border border-[var(--border-primary)] bg-[var(--bg-panel)] p-6 sm:p-10" aria-labelledby="strip-heading">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 id="strip-heading" className="text-2xl font-black sm:text-3xl">Representative definitions</h2>
              <p className="mt-3 text-sm leading-7 text-[var(--text-muted)]">{numericRecords.length} agencies with a numeric definition. Vertical position is only spacing; it has no meaning.</p>
            </div>
            <div className="flex gap-1 rounded-full bg-[var(--bg-stat)] p-1 text-xs font-black">
              {(['All', 'Canada', 'United States'] as const).map(option => <button key={option} type="button" onClick={() => { setCountry(option); setSelectedMinutes(null); }} className={`rounded-full px-3 py-1.5 transition-colors ${country === option ? 'bg-[var(--bg-panel)] text-[var(--text-primary)] shadow-sm' : 'text-[var(--text-muted)]'}`}>{option === 'United States' ? 'US' : option}</button>)}
            </div>
          </div>

          <div className="mt-8 overflow-x-auto">
            <svg viewBox="0 0 860 430" className="h-auto min-w-[42rem] w-full" role="img" aria-label="One dot per agency grouped by representative published frequent-service definition">
              <line x1="70" y1="35" x2="70" y2="350" stroke="var(--border-primary)" />
              <line x1="70" y1="350" x2="805" y2="350" stroke="var(--border-primary)" />
              {thresholds.map((minutes, index) => {
                const x = 105 + index * (660 / (thresholds.length - 1));
                const group = visibleRecords.filter(record => record.representativeThresholdMinutes === minutes);
                return <g key={minutes}>
                  <line x1={x} y1="35" x2={x} y2="350" stroke="var(--border-primary)" strokeDasharray="3 7" />
                  <text x={x} y="385" textAnchor="middle" fill="var(--text-primary)" fontSize="15" fontWeight="800">{minutes} min</text>
                  <text x={x} y="407" textAnchor="middle" fill="var(--text-muted)" fontSize="13">{group.length} {group.length === 1 ? 'agency' : 'agencies'}</text>
                  {group.map((record, dotIndex) => {
                    const y = 330 - (dotIndex % Math.ceil(maxCount / 2)) * 19 - Math.floor(dotIndex / Math.ceil(maxCount / 2)) * 10;
                    const cx = x + (dotIndex % 2 === 0 ? -5 : 5);
                    const active = selectedMinutes === minutes;
                    return <circle key={record.agencyId} cx={cx} cy={y} r={active ? 8 : 6} fill={record.country === 'Canada' ? 'var(--accent)' : 'var(--text-primary)'} opacity={selectedMinutes && !active ? 0.35 : 1} className="cursor-pointer transition-all" onMouseEnter={() => setHoveredAgency(record.agencyId)} onMouseLeave={() => setHoveredAgency(null)} onFocus={() => setHoveredAgency(record.agencyId)} onBlur={() => setHoveredAgency(null)} onClick={() => setSelectedMinutes(minutes)} tabIndex={0} role="button" aria-label={`${record.agencyName}, ${minutes} minutes`}><title>{record.agencyName} — {minutes} minutes</title></circle>;
                  })}
                  {hoveredAgency && group.some(record => record.agencyId === hoveredAgency) && (() => { const record = group.find(item => item.agencyId === hoveredAgency)!; return <g pointerEvents="none"><rect x={x - 92} y="12" width="184" height="28" rx="14" fill="var(--text-primary)" /><text x={x} y="31" textAnchor="middle" fill="var(--bg-app)" fontSize="11" fontWeight="700">{record.agencyName}</text></g>; })()}
                </g>;
              })}
            </svg>
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-4 text-xs text-[var(--text-muted)]"><span className="inline-flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-[var(--accent)]" />Canada</span><span className="inline-flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-[var(--text-primary)]" />United States</span><span>Click a cluster to highlight it.</span></div>

          {selectedMinutes && <div className="mt-6 rounded-2xl bg-[var(--bg-stat)] p-5"><p className="text-sm font-black">{selectedMinutes}-minute definitions</p><div className="mt-3 flex flex-wrap gap-2">{visibleRecords.filter(record => record.representativeThresholdMinutes === selectedMinutes).map(record => <span key={record.agencyId} className="rounded-full bg-[var(--bg-panel)] px-3 py-1.5 text-xs text-[var(--text-muted)]">{record.agencyName}</span>)}</div></div>}

          <div className="mt-8 grid gap-4 border-t border-[var(--border-primary)] pt-6 text-sm sm:grid-cols-3">
            <div><p className="font-black text-[var(--text-primary)]">{records.filter(record => record.status === 'qualitative_definition_on_map').length}</p><p className="mt-1 text-[var(--text-muted)]">qualitative definitions</p></div>
            <div><p className="font-black text-[var(--text-primary)]">{records.filter(record => record.status === 'no_definition_on_map').length}</p><p className="mt-1 text-[var(--text-muted)]">no named definition</p></div>
            <div><p className="font-black text-[var(--text-primary)]">{records.filter(record => record.status === 'map_unavailable').length}</p><p className="mt-1 text-[var(--text-muted)]">map unavailable</p></div>
          </div>
          <p className="mt-6 text-xs leading-5 text-[var(--text-dim)]">The three categories below the plot are part of the reviewed sample but cannot be placed on a minutes axis. Ranges, time periods, and secondary tiers remain in the audit.</p>
        </section>
      </div>
    </main>
  );
}
