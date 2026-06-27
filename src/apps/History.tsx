import React, { useState, useEffect, useMemo } from 'react';
import { Search, ChevronLeft } from 'lucide-react';
import { useHistoryMapOverlay } from '../context/HistoryMapOverlay';
import { HISTORY_DATA } from '../../shared/historyConfig';
import type { AgencyHistory, RouteHistoryEntry } from '../../shared/historyConfig';
import type { Agency } from '../App';
import { CHIP_BASE } from '../styles';

interface Props {
  active: boolean;
  agencies: Agency[];
  onInfoOpen?: (tab?: 'about' | 'agencies' | 'live') => void;
}

const FREQ_OPTIONS: { label: string; max: number }[] = [
  { label: '≤5 min', max: 5 },
  { label: '≤10 min', max: 10 },
  { label: '≤15 min', max: 15 },
  { label: 'Any', max: Infinity },
];

function headwayDisplay(min: number): string {
  return Number.isInteger(min) ? `${min} min` : `${min} min`;
}

function changeSummary(entry: RouteHistoryEntry): { text: string; worse: boolean } | null {
  const snaps = entry.snapshots;
  if (snaps.length < 2) return null;
  const first = snaps[0];
  const last = snaps[snaps.length - 1];
  const ratio = last.weekdayHeadwayMin / first.weekdayHeadwayMin;
  if (Math.abs(ratio - 1) < 0.05) return null;
  if (ratio > 1) {
    const x = Math.round(ratio * 10) / 10;
    return { text: `${x}× less frequent since ${first.label}`, worse: true };
  }
  const x = Math.round((1 / ratio) * 10) / 10;
  return { text: `${x}× more frequent since ${first.label}`, worse: false };
}

function RouteCard({ entry, highlightYear }: { entry: RouteHistoryEntry; highlightYear: number | null }) {
  const snaps = entry.snapshots;
  const first = snaps[0];
  const last = snaps[snaps.length - 1];
  const worse = last.weekdayHeadwayMin > first.weekdayHeadwayMin;
  const better = last.weekdayHeadwayMin < first.weekdayHeadwayMin;
  const summary = changeSummary(entry);

  return (
    <div className="bg-[var(--bg-app)] border border-[var(--border-primary)] rounded-xl p-4">
      <div className="flex items-baseline gap-2 mb-3">
        <span className="text-sm font-black text-[var(--text-primary)]">{entry.routeShortName}</span>
        <span className="text-[11px] text-[var(--text-muted)]">{entry.routeName}</span>
      </div>

      <div className="flex items-end gap-3 flex-wrap">
        {snaps.map((snap, i) => {
          const isLast = i === snaps.length - 1;
          const isHighlighted = highlightYear === snap.year;
          const headwayColor = isHighlighted
            ? 'text-[var(--accent)]'
            : isLast
              ? worse ? 'text-red-500' : better ? 'text-green-500' : 'text-[var(--text-primary)]'
              : 'text-[var(--text-dim)]';
          return (
            <React.Fragment key={snap.label}>
              <div className={`flex flex-col items-center transition-opacity ${isHighlighted ? '' : highlightYear !== null ? 'opacity-50' : ''}`}>
                <span className={`text-2xl font-black tabular-nums leading-none ${headwayColor}`}>
                  {headwayDisplay(snap.weekdayHeadwayMin)}
                </span>
                <span className={`text-[9px] font-bold mt-1 ${isHighlighted ? 'text-[var(--accent)]' : 'text-[var(--text-dim)]'}`}>
                  {snap.label}
                </span>
              </div>
              {!isLast && (
                <span className="text-[var(--text-dim)] text-lg mb-1">→</span>
              )}
            </React.Fragment>
          );
        })}
      </div>

      {summary && (
        <p className={`text-[10px] font-bold mt-3 ${summary.worse ? 'text-red-500' : 'text-green-500'}`}>
          {summary.text}
        </p>
      )}
    </div>
  );
}

function AgencyView({
  agency,
  onBack,
}: {
  agency: AgencyHistory;
  onBack: () => void;
}) {
  const allYears = useMemo(() => {
    const years = new Set<number>();
    agency.routes.forEach(r => r.snapshots.forEach(s => years.add(s.year)));
    return [...years].sort((a, b) => a - b);
  }, [agency]);

  const [highlightYear, setHighlightYear] = useState<number | null>(null);
  const [maxFreq, setMaxFreq] = useState<number>(Infinity);

  const snapLabels = useMemo(() => {
    const map = new Map<number, string>();
    agency.routes.forEach(r => r.snapshots.forEach(s => map.set(s.year, s.label)));
    return map;
  }, [agency]);

  const filteredRoutes = useMemo(() => {
    if (maxFreq === Infinity && highlightYear === null) return agency.routes;
    return agency.routes.filter(route => {
      if (maxFreq === Infinity) return true;
      const year = highlightYear ?? Math.max(...allYears);
      const snap = route.snapshots.find(s => s.year === year)
        ?? route.snapshots[route.snapshots.length - 1];
      return snap.weekdayHeadwayMin <= maxFreq;
    });
  }, [agency.routes, highlightYear, maxFreq, allYears]);

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 px-6 pt-4 pb-3 border-b border-[var(--border-primary)]">
        <div className="flex items-center gap-2 mb-3">
          <button
            onClick={onBack}
            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-[var(--bg-btn-hover)] text-[var(--text-dim)] hover:text-[var(--text-primary)] transition-colors shrink-0"
            aria-label="Back"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div>
            <p className="text-xs font-black text-[var(--text-primary)]">{agency.name}</p>
            <p className="text-[9px] text-[var(--text-dim)]">{agency.region}</p>
          </div>
        </div>

        {/* Year filter chips */}
        <div className="flex items-center gap-1.5 flex-wrap mb-2">
          <span className="text-[9px] font-bold text-[var(--text-dim)] uppercase tracking-wide mr-0.5">Year</span>
          {allYears.map(year => {
            const active = highlightYear === year;
            const label = snapLabels.get(year) ?? String(year);
            return (
              <button
                key={year}
                onClick={() => setHighlightYear(active ? null : year)}
                className={`h-6 px-2.5 text-[10px] font-bold rounded-full border transition-all ${CHIP_BASE} ${
                  active
                    ? 'bg-[var(--accent)] text-white border-transparent'
                    : 'border-[var(--border-primary)] text-[var(--text-dim)] hover:text-[var(--text-primary)]'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* Frequency filter chips */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[9px] font-bold text-[var(--text-dim)] uppercase tracking-wide mr-0.5">Freq</span>
          {FREQ_OPTIONS.map(opt => {
            const active = maxFreq === opt.max;
            return (
              <button
                key={opt.label}
                onClick={() => setMaxFreq(opt.max)}
                className={`h-6 px-2.5 text-[10px] font-bold rounded-full border transition-all ${CHIP_BASE} ${
                  active
                    ? 'bg-[var(--accent)] text-white border-transparent'
                    : 'border-[var(--border-primary)] text-[var(--text-dim)] hover:text-[var(--text-primary)]'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4 flex flex-col gap-3">
        {filteredRoutes.length === 0 && (
          <p className="text-[11px] text-[var(--text-dim)]">No routes match these filters.</p>
        )}
        {filteredRoutes.map(route => (
          <RouteCard key={route.routeShortName} entry={route} highlightYear={highlightYear} />
        ))}
      </div>
    </div>
  );
}

export default function History({ active, agencies, onInfoOpen }: Props) {
  const [query, setQuery] = useState('');
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [shouldRender, setShouldRender] = useState(active);
  const [visible, setVisible] = useState(false);
  const { setOverlay } = useHistoryMapOverlay();

  useEffect(() => {
    if (active) {
      setShouldRender(true);
      const id = setTimeout(() => setVisible(true), 10);
      return () => clearTimeout(id);
    } else {
      setVisible(false);
      const id = setTimeout(() => setShouldRender(false), 280);
      return () => clearTimeout(id);
    }
  }, [active]);

  useEffect(() => {
    if (!active) { setOverlay(null); return; }
    const agency = HISTORY_DATA.find(a => a.slug === selectedSlug);
    if (agency?.center) {
      setOverlay({ slug: agency.slug, routeShortName: '', stops: [], agencyCenter: agency.center });
    } else {
      setOverlay(null);
    }
  }, [active, selectedSlug, setOverlay]);

  useEffect(() => { if (!active) setOverlay(null); }, [active, setOverlay]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    if (!q) return HISTORY_DATA;
    return HISTORY_DATA.filter(a =>
      a.name.toLowerCase().includes(q) || a.region.toLowerCase().includes(q)
    );
  }, [query]);

  const selectedAgency = HISTORY_DATA.find(a => a.slug === selectedSlug) ?? null;

  if (!shouldRender) return null;

  return (
    <div
      className={`absolute bottom-0 inset-x-0 z-[1000] bg-[var(--bg-panel)]/95 backdrop-blur-md border-t border-[var(--border-primary)] flex flex-col transition-transform duration-300 ease-out ${visible ? 'translate-y-0' : 'translate-y-full'}`}
      style={{ maxHeight: '52vh' }}
    >
      {selectedAgency ? (
        <AgencyView agency={selectedAgency} onBack={() => setSelectedSlug(null)} />
      ) : (
        <>
          <div className="shrink-0 px-6 pt-4 pb-3 border-b border-[var(--border-primary)]">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wide">Frequency History</p>
              {onInfoOpen && (
                <button
                  onClick={() => onInfoOpen()}
                  className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-[var(--bg-btn-hover)] text-[var(--text-dim)] hover:text-[var(--accent)] transition-colors"
                  aria-label="About Atlas"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                </button>
              )}
            </div>
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[var(--bg-btn)] border border-[var(--border-primary)]">
              <Search className="w-3.5 h-3.5 text-[var(--text-dim)] shrink-0" />
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Find an agency..."
                className="flex-1 bg-transparent text-xs font-bold text-[var(--text-primary)] placeholder:text-[var(--text-dim)] outline-none"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-4 flex flex-col gap-2">
            {filtered.length === 0 && (
              <p className="text-[11px] text-[var(--text-dim)]">No agencies match.</p>
            )}
            {filtered.map(agency => (
              <button
                key={agency.slug}
                onClick={() => setSelectedSlug(agency.slug)}
                className="flex items-center justify-between w-full px-4 py-3 rounded-xl bg-[var(--bg-app)] border border-[var(--border-primary)] hover:border-[var(--accent-border)] hover:bg-[var(--accent-bg)] transition-colors text-left group"
              >
                <div>
                  <p className="text-xs font-black text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors">{agency.name}</p>
                  <p className="text-[9px] text-[var(--text-dim)] mt-0.5">
                    {agency.region} · {agency.routes.length} route{agency.routes.length !== 1 ? 's' : ''}
                  </p>
                </div>
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--text-dim)] group-hover:text-[var(--accent)] transition-colors shrink-0"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
