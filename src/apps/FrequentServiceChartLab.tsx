import { useState } from 'react';
import audit from '../../docs/research/system-map-audit-2026-09.json';

const thresholds = [10, 12, 15, 20, 30];
const promiseBands = ['Peak only', 'Weekday daytime', 'All day / all week', 'Varies by route'];
const records = audit.records.filter(record => (record.country === 'Canada' || record.country === 'United States') && Number.isInteger(record.representativeThresholdMinutes));

function promiseBand(record: typeof records[number]) {
  const text = `${record.serviceSpan ?? ''} ${record.days ?? ''}`.toLowerCase();
  if (text.includes('peak') || text.includes('rush')) return 'Peak only';
  if (text.includes('varies') || text.includes('route-specific') || text.includes('route specific')) return 'Varies by route';
  if (text.includes('weekend') || text.includes('all day') || text.includes('all time') || text.includes('7 days') || text.includes('throughout')) return 'All day / all week';
  return 'Weekday daytime';
}

export default function FrequentServiceChartLab() {
  const [country, setCountry] = useState<'All' | 'Canada' | 'United States'>('All');
  const [hoveredAgency, setHoveredAgency] = useState<string | null>(null);
  const visibleRecords = country === 'All' ? records : records.filter(record => record.country === country);
  const chartRecords = visibleRecords.map(record => ({ ...record, band: promiseBand(record) }));
  const hovered = chartRecords.find(record => record.agencyId === hoveredAgency);
  const xFor = (minutes: number) => 155 + thresholds.indexOf(minutes) * 145;
  const yFor = (band: string) => 70 + promiseBands.indexOf(band) * 76;

  return (
    <main className="h-full overflow-y-auto bg-[var(--bg-app)] px-5 pb-24 pt-28 text-[var(--text-primary)] sm:px-10">
      <div className="mx-auto max-w-6xl">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-[var(--accent)]">Research chart lab</p>
        <h1 className="mt-4 max-w-3xl text-4xl font-black tracking-[-0.04em] sm:text-6xl">A frequency number is also a promise.</h1>
        <p className="mt-5 max-w-2xl text-base leading-8 text-[var(--text-muted)]">The same 15-minute definition can mean peak service, weekday daytime service, or something that runs all week. This view shows both parts of the promise.</p>

        <section className="mt-12 rounded-[2rem] border border-[var(--border-primary)] bg-[var(--bg-panel)] p-6 sm:p-10" aria-labelledby="matrix-heading">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div><h2 id="matrix-heading" className="text-2xl font-black sm:text-3xl">The frequency promise matrix</h2><p className="mt-3 text-sm leading-7 text-[var(--text-muted)]">One dot is one agency definition. Hover a dot to inspect the agency and its published wording.</p></div>
            <div className="flex gap-1 rounded-full bg-[var(--bg-stat)] p-1 text-xs font-black">{(['All', 'Canada', 'United States'] as const).map(option => <button key={option} type="button" onClick={() => setCountry(option)} className={`rounded-full px-3 py-1.5 ${country === option ? 'bg-[var(--bg-panel)] text-[var(--text-primary)] shadow-sm' : 'text-[var(--text-muted)]'}`}>{option === 'United States' ? 'US' : option}</button>)}</div>
          </div>

          <div className="mt-8 overflow-x-auto">
            <svg viewBox="0 0 900 410" className="h-auto min-w-[52rem] w-full" role="img" aria-label="Agency definitions plotted by frequency threshold and service period">
              {thresholds.map(minutes => <g key={minutes}><line x1={xFor(minutes)} y1="42" x2={xFor(minutes)} y2="350" stroke="var(--border-primary)" strokeDasharray="3 7" /><text x={xFor(minutes)} y="25" textAnchor="middle" fill="var(--text-primary)" fontSize="14" fontWeight="800">{minutes} min</text></g>)}
              {promiseBands.map(band => <g key={band}><line x1="155" y1={yFor(band)} x2="735" y2={yFor(band)} stroke="var(--border-primary)" /><text x="140" y={yFor(band) + 4} textAnchor="end" fill="var(--text-muted)" fontSize="13" fontWeight="700">{band}</text></g>)}
              {chartRecords.map((record, index) => {
                const minutes = record.representativeThresholdMinutes as number;
                const baseX = xFor(minutes);
                const baseY = yFor(record.band);
                const nearby = chartRecords.slice(0, index).filter(item => item.representativeThresholdMinutes === minutes && item.band === record.band).length;
                const x = baseX + ((nearby % 3) - 1) * 10;
                const y = baseY + Math.floor(nearby / 3) * 13 - 6;
                const active = hoveredAgency === record.agencyId;
                return <circle key={record.agencyId} cx={x} cy={y} r={active ? 9 : 6} fill={record.country === 'Canada' ? 'var(--accent)' : 'var(--text-primary)'} opacity={hoveredAgency && !active ? 0.3 : 1} className="cursor-pointer transition-all" onMouseEnter={() => setHoveredAgency(record.agencyId)} onMouseLeave={() => setHoveredAgency(null)} onFocus={() => setHoveredAgency(record.agencyId)} onBlur={() => setHoveredAgency(null)} tabIndex={0} role="button" aria-label={`${record.agencyName}, ${minutes} minutes, ${record.band}`}><title>{record.agencyName} — {minutes} minutes — {record.band}</title></circle>;
              })}
              {hovered && <g pointerEvents="none"><rect x="550" y="362" width="320" height="36" rx="18" fill="var(--text-primary)" /><text x="710" y="385" textAnchor="middle" fill="var(--bg-app)" fontSize="11" fontWeight="700">{hovered.agencyName} · {hovered.representativeThresholdMinutes} min · {hovered.band}</text></g>}
            </svg>
          </div>
          <div className="mt-5 flex flex-wrap gap-4 text-xs text-[var(--text-muted)]"><span className="inline-flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-[var(--accent)]" />Canada</span><span className="inline-flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-[var(--text-primary)]" />United States</span><span>{visibleRecords.length} numeric definitions shown</span></div>
          <p className="mt-5 text-xs leading-5 text-[var(--text-dim)]">Service-period bands are an exploratory normalization of the audit wording, not a new claim about the agencies. The source wording remains attached to each record.</p>
        </section>
      </div>
    </main>
  );
}
