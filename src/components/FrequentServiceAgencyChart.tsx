import { useMemo, useState } from 'react';
import audit from '../../docs/research/system-map-audit-2026-09.json';

interface AuditRecord {
  agencyId: string;
  agencyName: string;
  country: string;
  representativeThresholdMinutes?: number;
  serviceSpan?: string | null;
  definitions?: Array<{ sourceUrl?: string; exactWording?: string }>;
  mapCandidates?: Array<{ url?: string }>;
}

const records = audit.records as AuditRecord[];

function parseTime(value: string) {
  const match = value.trim().match(/(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2] ?? 0);
  const meridiem = match[3]?.toLowerCase().replaceAll('.', '');
  if (meridiem === 'pm' && hour < 12) hour += 12;
  if (meridiem === 'am' && hour === 12) hour = 0;
  return hour + minute / 60;
}

function serviceSpanHours(value?: string | null) {
  if (!value) return null;
  const range = value.match(/(\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?)\s*[–-]\s*(\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?)/i);
  if (!range) return null;
  const start = parseTime(range[1]);
  const end = parseTime(range[2]);
  if (start === null || end === null) return null;
  return Math.round(((end < start ? end + 24 : end) - start) * 10) / 10;
}

const plottedRecords = records.flatMap(record => {
  const hours = serviceSpanHours(record.serviceSpan);
  return Number.isFinite(record.representativeThresholdMinutes) && hours !== null
    ? [{ record, hours }]
    : [];
});

export default function FrequentServiceAgencyChart() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = records.find(record => record.agencyId === selectedId) ?? null;
  const chart = useMemo(() => {
    const width = 920;
    const height = 460;
    const left = 82;
    const right = 28;
    const top = 28;
    const bottom = 72;
    const xValues = plottedRecords.map(item => item.record.representativeThresholdMinutes!);
    const yValues = plottedRecords.map(item => item.hours);
    const minX = Math.max(0, Math.floor(Math.min(...xValues, 0) / 5) * 5);
    const maxX = Math.ceil(Math.max(...xValues, 30) / 5) * 5;
    const maxY = Math.max(24, Math.ceil(Math.max(...yValues, 0) / 4) * 4);
    const x = (minutes: number) => left + ((minutes - minX) / Math.max(maxX - minX, 1)) * (width - left - right);
    const y = (hours: number) => height - bottom - (hours / maxY) * (height - top - bottom);
    const xTicks = Array.from({ length: Math.floor((maxX - minX) / 5) + 1 }, (_, index) => minX + index * 5);
    const yTicks = Array.from({ length: Math.floor(maxY / 4) + 1 }, (_, index) => index * 4);
    return { width, height, left, right, top, bottom, x, y, xTicks, yTicks };
  }, []);

  return (
    <div className="mt-10 border-t border-[var(--border-primary)] pt-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-black text-[var(--text-primary)]">Each dot is one agency</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">A lower number on the X-axis means more frequent service.</p>
        </div>
        <p className="text-xs font-bold text-[var(--text-muted)]">{plottedRecords.length} plotted · {records.length - plottedRecords.length} need clearer published span data</p>
      </div>

      <div className="mt-5 overflow-x-auto">
        <svg viewBox={`0 0 ${chart.width} ${chart.height}`} className="min-w-[620px] w-full" role="img" aria-label="Scatter plot of published service frequency and daily service span by agency">
          {chart.yTicks.map(hours => (
            <g key={`y-${hours}`}>
              <line x1={chart.left} x2={chart.width - chart.right} y1={chart.y(hours)} y2={chart.y(hours)} stroke="var(--border-primary)" />
              <text x={chart.left - 12} y={chart.y(hours) + 4} textAnchor="end" fill="var(--text-muted)" fontSize="12" fontWeight="700">{hours}h</text>
            </g>
          ))}
          {chart.xTicks.map(minutes => (
            <g key={`x-${minutes}`}>
              <line x1={chart.x(minutes)} x2={chart.x(minutes)} y1={chart.top} y2={chart.height - chart.bottom} stroke="var(--border-primary)" strokeDasharray="3 5" />
              <text x={chart.x(minutes)} y={chart.height - 42} textAnchor="middle" fill="var(--text-muted)" fontSize="12" fontWeight="700">{minutes}</text>
            </g>
          ))}
          <text x={(chart.left + chart.width - chart.right) / 2} y={chart.height - 12} textAnchor="middle" fill="var(--text-primary)" fontSize="13" fontWeight="800">Published service interval (minutes)</text>
          <text transform={`translate(16 ${(chart.top + chart.height - chart.bottom) / 2}) rotate(-90)`} textAnchor="middle" fill="var(--text-primary)" fontSize="13" fontWeight="800">Approximate daily service span (hours)</text>
          {plottedRecords.map(({ record, hours }) => {
            const isSelected = selectedId === record.agencyId;
            return (
              <g key={record.agencyId} role="button" tabIndex={0} aria-label={`${record.agencyName}, every ${record.representativeThresholdMinutes} minutes, ${hours} hours`} onClick={() => setSelectedId(record.agencyId)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') setSelectedId(record.agencyId); }}>
                <circle cx={chart.x(record.representativeThresholdMinutes!)} cy={chart.y(hours)} r={isSelected ? 10 : 7} fill="var(--accent)" fillOpacity={isSelected ? 1 : 0.78} stroke={isSelected ? 'var(--text-primary)' : 'var(--bg-panel)'} strokeWidth={isSelected ? 3 : 2} />
                <title>{record.agencyName} · every {record.representativeThresholdMinutes} minutes · approximately {hours} hours</title>
              </g>
            );
          })}
        </svg>
      </div>

      <p className="mt-3 text-xs leading-5 text-[var(--text-muted)]">The vertical position uses the first published daily time range we could read. It is a comparison aid, not a claim that every day follows that exact span.</p>
      {selected ? (
        <div className="mt-5 rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-app)] p-4" aria-live="polite">
          <p className="font-black text-[var(--text-primary)]">{selected.agencyName}</p>
          <p className="mt-1 text-sm text-[var(--text-muted)]">Every {selected.representativeThresholdMinutes} minutes · {serviceSpanHours(selected.serviceSpan)} hours in the plotted span</p>
          {selected.serviceSpan && <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">{selected.serviceSpan}</p>}
          {(selected.definitions?.[0]?.sourceUrl ?? selected.mapCandidates?.[0]?.url) && <a className="mt-2 inline-block text-sm font-bold text-[var(--accent)] underline" href={selected.definitions?.[0]?.sourceUrl ?? selected.mapCandidates?.[0]?.url} target="_blank" rel="noreferrer">View source</a>}
        </div>
      ) : (
        <p className="mt-4 text-xs text-[var(--text-dim)]">Select a dot to see the agency’s published wording and service span.</p>
      )}
    </div>
  );
}
