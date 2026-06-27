import React, { useState, useEffect, useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useHistoryMapOverlay } from '../context/HistoryMapOverlay';
import { HISTORY_DATA } from '../../shared/historyConfig';
import type { AgencyHistory, RouteHistoryEntry } from '../../shared/historyConfig';
import type { Agency } from '../App';
import { CHIP_BASE } from '../styles';

interface Props {
  active: boolean;
  agencies: Agency[];
  onInfoOpen?: (tab?: 'about' | 'agencies' | 'live') => void;
  query: string;
}

const FREQ_OPTIONS: { label: string; max: number }[] = [
  { label: '≤5 min', max: 5 },
  { label: '≤10 min', max: 10 },
  { label: '≤15 min', max: 15 },
  { label: 'Any', max: Infinity },
];

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
    <div className="py-3 border-b border-[var(--border-primary)] last:border-0">
      <div className="flex items-baseline gap-1.5 mb-2">
        <span className="text-xs font-black text-[var(--text-primary)]">{entry.routeShortName}</span>
        <span className="text-[10px] text-[var(--text-muted)] truncate">{entry.routeName}</span>
      </div>

      <div className="flex items-end gap-2 flex-wrap">
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
              <div className={`flex flex-col items-center transition-opacity ${isHighlighted ? '' : highlightYear !== null ? 'opacity-40' : ''}`}>
                <span className={`text-lg font-black tabular-nums leading-none ${headwayColor}`}>
                  {snap.weekdayHeadwayMin} min
                </span>
                <span className={`text-[8px] font-bold mt-0.5 ${isHighlighted ? 'text-[var(--accent)]' : 'text-[var(--text-dim)]'}`}>
                  {snap.label}
                </span>
              </div>
              {!isLast && (
                <span className="text-[var(--text-dim)] mb-1">→</span>
              )}
            </React.Fragment>
          );
        })}
      </div>

      {summary && (
        <p className={`text-[9px] font-bold mt-1.5 ${summary.worse ? 'text-red-500' : 'text-green-500'}`}>
          {summary.text}
        </p>
      )}
    </div>
  );
}

function AgencyView({ agency, onBack }: { agency: AgencyHistory; onBack: () => void }) {
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
    if (maxFreq === Infinity) return agency.routes;
    return agency.routes.filter(route => {
      const year = highlightYear ?? Math.max(...allYears);
      const snap = route.snapshots.find(s => s.year === year)
        ?? route.snapshots[route.snapshots.length - 1];
      return snap.weekdayHeadwayMin <= maxFreq;
    });
  }, [agency.routes, highlightYear, maxFreq, allYears]);

  return (
    <>
      {/* Header card */}
      <div className="bg-[var(--bg-panel)] backdrop-blur-md border border-[var(--border-primary)] rounded-2xl shadow-2xl px-4 pt-3 pb-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
        <div className="flex items-center gap-1.5 mb-3">
          <button
            onClick={onBack}
            className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-[var(--bg-btn-hover)] text-[var(--text-dim)] hover:text-[var(--text-primary)] transition-colors shrink-0"
            aria-label="Back"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <div>
            <p className="text-xs font-black text-[var(--text-primary)]">{agency.name}</p>
            <p className="text-[9px] text-[var(--text-dim)]">{agency.region}</p>
          </div>
        </div>

        <div className="flex items-center gap-1 flex-wrap mb-1.5">
          <span className="text-[8px] font-bold text-[var(--text-dim)] mr-0.5">Year</span>
          {allYears.map(year => {
            const active = highlightYear === year;
            return (
              <button
                key={year}
                onClick={() => setHighlightYear(active ? null : year)}
                className={`h-5 px-2 text-[9px] font-bold ${CHIP_BASE} transition-all ${
                  active ? 'bg-[var(--accent)] text-white border-transparent' : 'border-[var(--border-primary)] text-[var(--text-dim)] hover:text-[var(--text-primary)]'
                }`}
              >
                {snapLabels.get(year) ?? String(year)}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-[8px] font-bold text-[var(--text-dim)] mr-0.5">Freq</span>
          {FREQ_OPTIONS.map(opt => {
            const active = maxFreq === opt.max;
            return (
              <button
                key={opt.label}
                onClick={() => setMaxFreq(opt.max)}
                className={`h-5 px-2 text-[9px] font-bold ${CHIP_BASE} transition-all ${
                  active ? 'bg-[var(--accent)] text-white border-transparent' : 'border-[var(--border-primary)] text-[var(--text-dim)] hover:text-[var(--text-primary)]'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Route list card */}
      <div className="bg-[var(--bg-panel)] backdrop-blur-md border border-[var(--border-primary)] rounded-2xl shadow-2xl px-4 flex-1 overflow-y-auto custom-scrollbar animate-in fade-in slide-in-from-bottom-2 duration-300">
        {filteredRoutes.length === 0 && (
          <p className="text-[11px] text-[var(--text-dim)] py-4">No routes match these filters.</p>
        )}
        {filteredRoutes.map(route => (
          <RouteCard key={route.routeShortName} entry={route} highlightYear={highlightYear} />
        ))}
      </div>
    </>
  );
}

export default function History({ active, agencies, onInfoOpen, query }: Props) {
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
    const agency = HISTORY_DATA.find(a => a.slug === selectedSlug) ?? HISTORY_DATA[0] ?? null;
    if (agency?.center) {
      setOverlay({ slug: agency.slug, routeShortName: '', stops: [], agencyCenter: agency.center });
    } else {
      setOverlay(null);
    }
  }, [active, selectedSlug, setOverlay]);

  useEffect(() => { if (!active) setOverlay(null); }, [active, setOverlay]);
  useEffect(() => { setSelectedSlug(null); }, [query]);

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
      className={`absolute top-20 left-[182px] z-[1000] w-72 max-h-[calc(100vh-104px)] flex flex-col gap-3 transition-opacity duration-300 ease-out ${visible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
    >
      {selectedAgency ? (
        <AgencyView agency={selectedAgency} onBack={() => setSelectedSlug(null)} />
      ) : (
        <div className="bg-[var(--bg-panel)] backdrop-blur-md border border-[var(--border-primary)] rounded-2xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="px-4 pt-3 pb-2 border-b border-[var(--border-primary)]">
            <p className="text-[10px] font-bold text-[var(--text-muted)]">Frequency History</p>
          </div>
          {filtered.length === 0 && (
            <p className="text-[11px] text-[var(--text-dim)] px-4 py-3">No agencies match.</p>
          )}
          {filtered.map(agency => (
            <button
              key={agency.slug}
              onClick={() => setSelectedSlug(agency.slug)}
              className="flex items-center justify-between w-full px-4 py-3 border-b border-[var(--border-primary)] last:border-0 hover:bg-[var(--bg-btn-hover)] transition-colors text-left group"
            >
              <div>
                <p className="text-xs font-black text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors">{agency.name}</p>
                <p className="text-[9px] text-[var(--text-dim)] mt-0.5">
                  {agency.region} · {agency.routes.length} route{agency.routes.length !== 1 ? 's' : ''}
                </p>
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-[var(--text-dim)] group-hover:text-[var(--accent)] transition-colors shrink-0" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
