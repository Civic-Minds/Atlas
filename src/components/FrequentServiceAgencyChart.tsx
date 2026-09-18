import { useMemo, useState } from 'react';
import audit from '../../docs/research/system-map-audit-2026-09.json';
import { frequentServiceStoryStats } from '../data/frequentServiceStory';

interface AuditRecord {
  agencyId: string;
  agencyName: string;
  country: string;
  status: string;
  representativeThresholdMinutes?: number;
  thresholdText?: string;
  serviceSpan?: string;
  geography?: string;
  mode?: string;
  definitions?: Array<{ sourceUrl?: string; exactWording?: string }>;
  mapCandidates?: Array<{ url?: string }>;
}

const records = audit.records as AuditRecord[];
const numericRecords = records.filter(record => Number.isFinite(record.representativeThresholdMinutes));
const laneLabels = ['network', 'corridor', 'route', 'other'];

function laneFor(record: AuditRecord) {
  return laneLabels.includes(record.geography ?? '') ? record.geography! : 'other';
}

export default function FrequentServiceAgencyChart() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const thresholds = frequentServiceStoryStats.headwayBars.map(bar => bar.minutes);
  const minThreshold = Math.min(...thresholds);
  const maxThreshold = Math.max(...thresholds);
  const selected = numericRecords.find(record => record.agencyId === selectedId) ?? null;
  const chart = useMemo(() => {
    const width = 920;
    const height = 360;
    const left = 150;
    const right = 40;
    const top = 30;
    const bottom = 58;
    const x = (minutes: number) => left + ((minutes - minThreshold) / Math.max(maxThreshold - minThreshold, 1)) * (width - left - right);
    const rows = new Map<string, AuditRecord[]>();
    numericRecords.forEach(record => {
      const lane = laneFor(record);
      rows.set(lane, [...(rows.get(lane) ?? []), record]);
    });
    const y = (lane: string) => top + laneLabels.indexOf(lane) * ((height - top - bottom) / (laneLabels.length - 1));
    return { width, height, left, right, top, bottom, x, y, rows };
  }, []);

  return (
    <div className="mt-10 border-t border-[var(--border-primary)] pt-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-black text-[var(--text-primary)]">One dot = one agency</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">Only agencies with one representative numeric threshold are plotted.</p>
        </div>
        <p className="text-xs font-bold text-[var(--text-muted)]">{numericRecords.length} plotted · {records.length - numericRecords.length} without one exact number</p>
      </div>
      <div className="mt-5 overflow-x-auto">
        <svg viewBox={`0 0 ${chart.width} ${chart.height}`} className="min-w-[620px] w-full" role="img" aria-label="Agencies plotted by their representative published frequency threshold and service geography">
          {laneLabels.map(lane => (
            <g key={lane}>
              <line x1={chart.left} x2={chart.width - chart.right} y1={chart.y(lane)} y2={chart.y(lane)} stroke="var(--border-primary)" />
              <text x={chart.left - 14} y={chart.y(lane) + 4} textAnchor="end" fill="var(--text-muted)" fontSize="13" fontWeight="700">{lane}</text>
            </g>
          ))}
          {thresholds.map(minutes => (
            <g key={minutes}>
              <line x1={chart.x(minutes)} x2={chart.x(minutes)} y1={chart.top} y2={chart.height - chart.bottom} stroke="var(--border-primary)" strokeDasharray="3 5" />
              <text x={chart.x(minutes)} y={chart.height - 20} textAnchor="middle" fill="var(--text-muted)" fontSize="13" fontWeight="700">{minutes} min</text>
            </g>
          ))}
          {laneLabels.flatMap(lane => chart.rows.get(lane) ?? []).map(record => {
            const laneRecords = chart.rows.get(laneFor(record)) ?? [];
            const laneIndex = laneRecords.indexOf(record);
            const spread = Math.min(22, laneRecords.length * 3.5);
            const jitter = laneRecords.length > 1 ? (laneIndex / (laneRecords.length - 1) - 0.5) * spread : 0;
            const cx = chart.x(record.representativeThresholdMinutes!);
            const cy = chart.y(laneFor(record)) + jitter;
            const isSelected = selectedId === record.agencyId;
            return (
              <g key={record.agencyId} role="button" tabIndex={0} aria-label={`${record.agencyName}, ${record.representativeThresholdMinutes} minutes, ${laneFor(record)}`} onClick={() => setSelectedId(record.agencyId)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') setSelectedId(record.agencyId); }}>
                <circle cx={cx} cy={cy} r={isSelected ? 10 : 7} fill="var(--accent)" stroke={isSelected ? 'var(--text-primary)' : 'var(--bg-panel)'} strokeWidth={isSelected ? 3 : 2} />
                <title>{record.agencyName} · every {record.representativeThresholdMinutes} minutes · {laneFor(record)}</title>
              </g>
            );
          })}
        </svg>
      </div>
      {selected ? (
        <div className="mt-5 rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-app)] p-4" aria-live="polite">
          <p className="font-black text-[var(--text-primary)]">{selected.agencyName}</p>
          <p className="mt-1 text-sm text-[var(--text-muted)]">Every {selected.representativeThresholdMinutes} minutes · {laneFor(selected)} · {selected.mode ?? 'service'}</p>
          {selected.serviceSpan && <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">{selected.serviceSpan}</p>}
          {(selected.definitions?.[0]?.sourceUrl ?? selected.mapCandidates?.[0]?.url) && <a className="mt-2 inline-block text-sm font-bold text-[var(--accent)] underline" href={selected.definitions?.[0]?.sourceUrl ?? selected.mapCandidates?.[0]?.url} target="_blank" rel="noreferrer">View source</a>}
        </div>
      ) : (
        <p className="mt-4 text-xs text-[var(--text-dim)]">Select a dot to see the agency’s published wording and service span.</p>
      )}
    </div>
  );
}
