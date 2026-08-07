import React, { useMemo, useState } from 'react';
import type { Agency } from '../App';
import { useAgencyData } from '../hooks/useAgencyData';
import type { ShapeProperties } from '../hooks/useAgencyData';
import { buildRouteFacts, metricValueForPeriod } from '../utils/routeFacts';
import { TIME_PERIODS, type PeriodKey } from '../../shared/config';
import { DAY_TYPES, getNowDay, type DayType } from '../../shared/dayTypes';
import { FILTER_MODES, effectiveMode } from '../../shared/modes';
import { SURFACE, FLOATING_CARD } from '../styles';
import { CardReportButton } from '../components/Interval/cardUi';
import { currentAtlasUrl } from '../utils/reportIssue';

// useAgencyData normally loads by viewport bbox intersection. This table isn't tied to a map
// viewport, so cover the whole world -- what actually loads is controlled by which agencies are
// passed in (the region/search filters below), not by this bounds check.
const WORLD_BOUNDS = { s: -85, w: -180, n: 85, e: 180 };
const EMPTY_AGENCIES: Agency[] = [];
// Distinct from the '' "nothing picked yet" sentinel below, so explicitly choosing "All
// regions" is a real scope choice (loads everything) rather than indistinguishable from
// the untouched default state.
const ALL_REGIONS = '__all__';
const PAGE_SIZE = 50;
const MODE_LABELS = new Map<number, string>(FILTER_MODES.map(m => [m.id, m.label]));

interface DiagnosticsProps {
  agencies: Agency[];
}

interface Row {
  key: string;
  agencySlug: string;
  agencyName: string;
  routeLabel: string;
  routeLongName: string | null;
  headsign: string;
  tier: string | null;
  frequency: number | null;
  mode: number;
  modeLabel: string;
}

type SortKey = 'agency' | 'route' | 'headsign' | 'tier' | 'mode' | 'frequency';
type SortDir = 'asc' | 'desc';

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'agency', label: 'Agency' },
  { key: 'route', label: 'Route' },
  { key: 'headsign', label: 'Headsign' },
  { key: 'mode', label: 'Mode' },
  { key: 'tier', label: 'Tier' },
  { key: 'frequency', label: 'Frequency' },
];

/** Shared pill-toggle button, matching FilterPanel.tsx's Day/Period/Mode chip style. */
function FilterPill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-7 px-2.5 flex items-center justify-center text-[10px] font-bold rounded-full border transition-colors ${
        active
          ? 'bg-[var(--accent-bg)] border-[var(--accent-border)] text-[var(--accent)]'
          : 'border-[var(--border-primary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
      }`}
    >
      {children}
    </button>
  );
}

/**
 * Internal-only route table for spotting bad data by eye across many routes at once --
 * something the map is deliberately not built for. Beta-gated (DIAGNOSTICS_ENABLED), not
 * linked from the nav; reachable only by navigating to /apps/diagnostics/table directly.
 */
export default function Diagnostics({ agencies }: DiagnosticsProps) {
  const [regionFilter, setRegionFilter] = useState(ALL_REGIONS);
  const [agencySearch, setAgencySearch] = useState('');
  const [day, setDay] = useState<DayType>(getNowDay());
  const [period, setPeriod] = useState<PeriodKey | 'all'>('midday');
  const [selectedModes, setSelectedModes] = useState<Set<number>>(new Set());
  const [selectedTiers, setSelectedTiers] = useState<Set<string>>(new Set());
  const [minFreq, setMinFreq] = useState('');
  const [maxFreq, setMaxFreq] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('frequency');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [page, setPage] = useState(0);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const regions = useMemo(() => {
    const set = new Set<string>();
    for (const a of agencies) if (a.region) set.add(a.region);
    return [...set].sort();
  }, [agencies]);

  const filteredAgencies = useMemo(() => {
    const q = agencySearch.trim().toLowerCase();
    return agencies.filter(a => {
      if (regionFilter && regionFilter !== ALL_REGIONS && a.region !== regionFilter) return false;
      if (q && !a.name.toLowerCase().includes(q) && !a.slug.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [agencies, regionFilter, agencySearch]);

  // Defaults to All regions so the table has something in it on load. Clearing the region
  // dropdown to "Select a region..." (regionFilter === '') opts back out of loading anything,
  // for whenever you specifically want to search one agency without pulling in everyone else.
  const hasScope = regionFilter !== '' || agencySearch.trim() !== '';
  const { layers, isLoading } = useAgencyData(hasScope ? filteredAgencies : EMPTY_AGENCIES, WORLD_BOUNDS);

  const rows = useMemo<Row[]>(() => {
    if (!hasScope) return [];
    const out: Row[] = [];
    for (const agency of filteredAgencies) {
      const fc = layers[agency.slug];
      if (!fc) continue;
      const seen = new Set<string>();
      for (const feature of fc.features) {
        const p = feature.properties as (ShapeProperties & { stopId?: string; day?: string }) | null;
        if (!p?.routeId || p.stopId) continue;
        if (p.day && p.day !== day) continue;
        const facts = buildRouteFacts(p, agency.slug);
        const dedupeKey = `${facts.key}::${facts.directionId}::${facts.headsign ?? ''}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        const mode = effectiveMode({
          routeType: facts.routeType,
          routeLongName: facts.longName,
          routeShortName: facts.shortName,
          agencySlug: agency.slug,
        });
        out.push({
          key: dedupeKey,
          agencySlug: agency.slug,
          agencyName: agency.name,
          routeLabel: facts.shortName,
          routeLongName: facts.longName,
          headsign: facts.headsign ?? '—',
          tier: facts.tier,
          frequency: metricValueForPeriod(facts.service.display, period),
          mode,
          modeLabel: MODE_LABELS.get(mode) ?? 'Other',
        });
      }
    }
    return out;
  }, [filteredAgencies, layers, day, period, hasScope]);

  const availableTiers = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) if (r.tier) set.add(r.tier);
    return [...set].sort();
  }, [rows]);

  const filteredRows = useMemo(() => {
    const min = minFreq.trim() ? Number(minFreq) : null;
    const max = maxFreq.trim() ? Number(maxFreq) : null;
    return rows.filter(r => {
      if (min != null && (r.frequency == null || r.frequency < min)) return false;
      if (max != null && (r.frequency == null || r.frequency > max)) return false;
      if (selectedModes.size > 0 && !selectedModes.has(r.mode)) return false;
      if (selectedTiers.size > 0 && (!r.tier || !selectedTiers.has(r.tier))) return false;
      return true;
    });
  }, [rows, minFreq, maxFreq, selectedModes, selectedTiers]);

  const sortedRows = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...filteredRows].sort((a, b) => {
      switch (sortKey) {
        case 'agency': return dir * a.agencyName.localeCompare(b.agencyName);
        case 'route': return dir * a.routeLabel.localeCompare(b.routeLabel, undefined, { numeric: true });
        case 'headsign': return dir * a.headsign.localeCompare(b.headsign);
        case 'mode': return dir * a.modeLabel.localeCompare(b.modeLabel);
        case 'tier': return dir * (a.tier ?? '').localeCompare(b.tier ?? '');
        case 'frequency': {
          if (a.frequency == null && b.frequency == null) return 0;
          if (a.frequency == null) return 1;
          if (b.frequency == null) return -1;
          return dir * (a.frequency - b.frequency);
        }
        default: return 0;
      }
    });
  }, [filteredRows, sortKey, sortDir]);

  const pageCount = Math.max(1, Math.ceil(sortedRows.length / PAGE_SIZE));
  const clampedPage = Math.min(page, pageCount - 1);
  const pagedRows = useMemo(
    () => sortedRows.slice(clampedPage * PAGE_SIZE, clampedPage * PAGE_SIZE + PAGE_SIZE),
    [sortedRows, clampedPage],
  );

  const resetPage = () => setPage(0);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
    resetPage();
  };

  const toggleMode = (id: number) => {
    setSelectedModes(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    resetPage();
  };

  const toggleTier = (tier: string) => {
    setSelectedTiers(prev => {
      const next = new Set(prev);
      if (next.has(tier)) next.delete(tier); else next.add(tier);
      return next;
    });
    resetPage();
  };

  const inputClass = `h-8 px-3 text-xs font-bold rounded-full ${SURFACE} text-[var(--text-primary)] shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-border)]`;

  return (
    <div className="h-full w-full overflow-auto bg-[var(--bg-app)] text-[var(--text-primary)] p-4 pt-24">
      <h1 className="text-lg font-black mb-4">Route Diagnostics</h1>

      <div className="flex items-start gap-4">
        <aside className={`w-64 shrink-0 sticky top-24 ${FLOATING_CARD} p-4 flex flex-col gap-4 max-h-[calc(100vh-7rem)] overflow-y-auto`}>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-[var(--text-dim)]">Region</span>
            <select value={regionFilter} onChange={e => { setRegionFilter(e.target.value); resetPage(); }} className={`${inputClass} w-full`}>
              <option value="">Select a region…</option>
              <option value={ALL_REGIONS}>All regions</option>
              {regions.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-[var(--text-dim)]">Agency</span>
            <input
              value={agencySearch}
              onChange={e => { setAgencySearch(e.target.value); resetPage(); }}
              placeholder="Search name or slug…"
              className={`${inputClass} w-full`}
            />
          </label>
          <div className="flex gap-2">
            <label className="flex flex-col gap-1 flex-1 min-w-0">
              <span className="text-[10px] font-bold text-[var(--text-dim)]">Min freq</span>
              <input value={minFreq} onChange={e => { setMinFreq(e.target.value); resetPage(); }} placeholder="min" type="number" className={`${inputClass} w-full`} />
            </label>
            <label className="flex flex-col gap-1 flex-1 min-w-0">
              <span className="text-[10px] font-bold text-[var(--text-dim)]">Max freq</span>
              <input value={maxFreq} onChange={e => { setMaxFreq(e.target.value); resetPage(); }} placeholder="min" type="number" className={`${inputClass} w-full`} />
            </label>
          </div>

          <div className="h-px bg-[var(--border-primary)]" />

          <div>
            <p className="text-[9px] font-bold text-[var(--text-dim)] uppercase tracking-wide mb-1.5">Day of Service</p>
            <div className="flex flex-wrap gap-1.5">
              {DAY_TYPES.map(d => (
                <FilterPill key={d} active={day === d} onClick={() => { setDay(d); resetPage(); }}>{d}</FilterPill>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[9px] font-bold text-[var(--text-dim)] uppercase tracking-wide mb-1.5">Time Period</p>
            <div className="flex flex-wrap gap-1.5">
              <FilterPill active={period === 'all'} onClick={() => { setPeriod('all'); resetPage(); }}>All day</FilterPill>
              {TIME_PERIODS.map(p => (
                <FilterPill key={p.key} active={period === p.key} onClick={() => { setPeriod(p.key); resetPage(); }}>{p.label}</FilterPill>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[9px] font-bold text-[var(--text-dim)] uppercase tracking-wide mb-1.5">Transit Modes</p>
            <div className="flex flex-wrap gap-1.5">
              {FILTER_MODES.map(({ id, label }) => (
                <FilterPill key={id} active={selectedModes.has(id)} onClick={() => toggleMode(id)}>{label}</FilterPill>
              ))}
            </div>
          </div>
          {!isLoading && availableTiers.length > 0 && (
            <div>
              <p className="text-[9px] font-bold text-[var(--text-dim)] uppercase tracking-wide mb-1.5">Tier</p>
              <div className="flex flex-wrap gap-1.5">
                {availableTiers.map(tier => (
                  <FilterPill key={tier} active={selectedTiers.has(tier)} onClick={() => toggleTier(tier)}>{tier}</FilterPill>
                ))}
              </div>
            </div>
          )}

          <div className="h-px bg-[var(--border-primary)]" />
          <span className="text-[10px] font-bold text-[var(--text-dim)]">
            {sortedRows.length} rows{isLoading ? ' · loading…' : ''}
          </span>
        </aside>

        <div className="flex-1 min-w-0">
        {!hasScope ? (
          <p className="text-xs font-bold text-[var(--text-dim)]">
            Pick a region or search an agency to load its routes — nothing loads by default.
          </p>
        ) : isLoading ? (
          // Rows stream in one agency at a time and get re-sorted on every arrival -- rendering
          // that live was a visible, constant reshuffle. Wait for the full set before showing
          // anything so the table appears once, already sorted.
          <p className="text-xs font-bold text-[var(--text-dim)]">Loading routes…</p>
        ) : (
          <>
            <div className={`${FLOATING_CARD} overflow-hidden`}>
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="text-left border-b border-[var(--border-primary)]">
                    {COLUMNS.map(({ key, label }) => (
                      <th
                        key={key}
                        onClick={() => toggleSort(key)}
                        className="cursor-pointer select-none px-4 py-2.5 font-black hover:text-[var(--accent)] whitespace-nowrap"
                      >
                        {label}{sortKey === key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pagedRows.map(r => {
                    const expanded = expandedKey === r.key;
                    const title = `${r.agencyName} ${r.routeLabel}${r.routeLongName ? ` — ${r.routeLongName}` : ''}`;
                    const details = [
                      `**Agency:** ${r.agencyName} (${r.agencySlug})`,
                      `**Route:** ${r.routeLabel}${r.routeLongName ? ` — ${r.routeLongName}` : ''}`,
                      `**Headsign:** ${r.headsign}`,
                      `**Mode:** ${r.modeLabel}`,
                      `**Tier:** ${r.tier ?? 'none'}`,
                      `**Day:** ${day}`,
                      `**Period:** ${period}`,
                      `**Frequency:** ${r.frequency != null ? `every ${r.frequency} min` : 'none'}`,
                      `**Atlas URL:** ${currentAtlasUrl()}`,
                    ].join('\n');
                    return (
                      <React.Fragment key={r.key}>
                        <tr
                          onClick={() => setExpandedKey(expanded ? null : r.key)}
                          className={`cursor-pointer border-b border-[var(--border-primary)] last:border-0 hover:bg-[var(--bg-btn-hover)] transition-colors ${expanded ? 'bg-[var(--bg-btn-hover)]' : ''}`}
                        >
                          <td className="px-4 py-2 font-bold max-w-[220px] truncate" title={r.agencyName}>{r.agencyName}</td>
                          <td className="px-4 py-2 font-black whitespace-nowrap">{r.routeLabel}</td>
                          <td className="px-4 py-2 max-w-[260px] truncate" title={r.headsign}>{r.headsign}</td>
                          <td className="px-4 py-2 whitespace-nowrap">{r.modeLabel}</td>
                          <td className="px-4 py-2">{r.tier ?? '—'}</td>
                          <td className="px-4 py-2 font-black whitespace-nowrap">{r.frequency != null ? `${r.frequency} min` : '—'}</td>
                        </tr>
                        {expanded && (
                          <tr className="border-b border-[var(--border-primary)] last:border-0 bg-[var(--bg-app)]">
                            <td colSpan={COLUMNS.length} className="px-4 py-3">
                              <div className="flex items-start justify-between gap-4">
                                <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1.5 text-[11px]">
                                  <div><dt className="text-[var(--text-dim)] font-bold">Route long name</dt><dd className="font-bold">{r.routeLongName ?? '—'}</dd></div>
                                  <div><dt className="text-[var(--text-dim)] font-bold">Mode</dt><dd className="font-bold">{r.modeLabel}</dd></div>
                                  <div><dt className="text-[var(--text-dim)] font-bold">Tier</dt><dd className="font-bold">{r.tier ?? '—'}</dd></div>
                                  <div><dt className="text-[var(--text-dim)] font-bold">Day</dt><dd className="font-bold">{day}</dd></div>
                                  <div><dt className="text-[var(--text-dim)] font-bold">Period</dt><dd className="font-bold">{period}</dd></div>
                                  <div><dt className="text-[var(--text-dim)] font-bold">Agency slug</dt><dd className="font-bold">{r.agencySlug}</dd></div>
                                </dl>
                                <div className="shrink-0">
                                  <CardReportButton title={title} details={details} />
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {pageCount > 1 && (
              <div className="flex items-center justify-center gap-3 mt-3">
                <button
                  type="button"
                  disabled={clampedPage === 0}
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  className={`${inputClass} disabled:opacity-40 disabled:cursor-not-allowed`}
                >
                  Prev
                </button>
                <span className="text-[10px] font-bold text-[var(--text-dim)]">
                  Page {clampedPage + 1} of {pageCount}
                </span>
                <button
                  type="button"
                  disabled={clampedPage >= pageCount - 1}
                  onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))}
                  className={`${inputClass} disabled:opacity-40 disabled:cursor-not-allowed`}
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
        </div>
      </div>
    </div>
  );
}
