import React, { useMemo, useState } from 'react';
import type { Agency } from '../App';
import { useAgencyData } from '../hooks/useAgencyData';
import type { ShapeProperties } from '../hooks/useAgencyData';
import { buildRouteFacts, metricValueForPeriod } from '../utils/routeFacts';
import { TIME_PERIODS, type PeriodKey } from '../../shared/config';
import { DAY_TYPES, getNowDay, type DayType } from '../../shared/dayTypes';

// useAgencyData normally loads by viewport bbox intersection. This table isn't tied to a map
// viewport, so cover the whole world -- what actually loads is controlled by which agencies are
// passed in (the region/search filters below), not by this bounds check.
const WORLD_BOUNDS = { s: -85, w: -180, n: 85, e: 180 };
const EMPTY_AGENCIES: Agency[] = [];

interface DiagnosticsProps {
  agencies: Agency[];
}

interface Row {
  key: string;
  agencySlug: string;
  agencyName: string;
  routeLabel: string;
  headsign: string;
  tier: string | null;
  frequency: number | null;
}

type SortKey = 'agency' | 'route' | 'headsign' | 'tier' | 'frequency';
type SortDir = 'asc' | 'desc';

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'agency', label: 'Agency' },
  { key: 'route', label: 'Route' },
  { key: 'headsign', label: 'Headsign' },
  { key: 'tier', label: 'Tier' },
  { key: 'frequency', label: 'Frequency' },
];

/**
 * Internal-only route table for spotting bad data by eye across many routes at once --
 * something the map is deliberately not built for. Beta-gated (DIAGNOSTICS_ENABLED), not
 * linked from the nav; reachable only by navigating to /apps/diagnostics directly.
 */
export default function Diagnostics({ agencies }: DiagnosticsProps) {
  const [regionFilter, setRegionFilter] = useState('');
  const [agencySearch, setAgencySearch] = useState('');
  const [day, setDay] = useState<DayType>(getNowDay());
  const [period, setPeriod] = useState<PeriodKey | 'all'>('midday');
  const [minFreq, setMinFreq] = useState('');
  const [maxFreq, setMaxFreq] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('frequency');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const regions = useMemo(() => {
    const set = new Set<string>();
    for (const a of agencies) if (a.region) set.add(a.region);
    return [...set].sort();
  }, [agencies]);

  const filteredAgencies = useMemo(() => {
    const q = agencySearch.trim().toLowerCase();
    return agencies.filter(a => {
      if (regionFilter && a.region !== regionFilter) return false;
      if (q && !a.name.toLowerCase().includes(q) && !a.slug.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [agencies, regionFilter, agencySearch]);

  // Nothing fetches until a scope is picked -- loading all 400+ agencies' GeoJSON at once by
  // default would be a real amount of data for a page that's just for spot-checking.
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
        out.push({
          key: dedupeKey,
          agencySlug: agency.slug,
          agencyName: agency.name,
          routeLabel: facts.shortName,
          headsign: facts.headsign ?? '—',
          tier: facts.tier,
          frequency: metricValueForPeriod(facts.service.display, period),
        });
      }
    }
    return out;
  }, [filteredAgencies, layers, day, period, hasScope]);

  const filteredRows = useMemo(() => {
    const min = minFreq.trim() ? Number(minFreq) : null;
    const max = maxFreq.trim() ? Number(maxFreq) : null;
    return rows.filter(r => {
      if (min != null && (r.frequency == null || r.frequency < min)) return false;
      if (max != null && (r.frequency == null || r.frequency > max)) return false;
      return true;
    });
  }, [rows, minFreq, maxFreq]);

  const sortedRows = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...filteredRows].sort((a, b) => {
      switch (sortKey) {
        case 'agency': return dir * a.agencyName.localeCompare(b.agencyName);
        case 'route': return dir * a.routeLabel.localeCompare(b.routeLabel, undefined, { numeric: true });
        case 'headsign': return dir * a.headsign.localeCompare(b.headsign);
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

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  };

  const inputClass = 'text-xs font-bold px-2 py-1.5 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-panel)] text-[var(--text-primary)]';

  return (
    <div className="h-full w-full overflow-auto bg-[var(--bg-app)] text-[var(--text-primary)] p-4 pt-24">
      <h1 className="text-lg font-black mb-3">
        Route Diagnostics <span className="text-[10px] font-bold text-[var(--text-dim)] align-middle">internal, beta only</span>
      </h1>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <select value={regionFilter} onChange={e => setRegionFilter(e.target.value)} className={inputClass}>
          <option value="">All regions…</option>
          {regions.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <input
          value={agencySearch}
          onChange={e => setAgencySearch(e.target.value)}
          placeholder="Search agency name or slug…"
          className={`${inputClass} w-56`}
        />
        <select value={day} onChange={e => setDay(e.target.value as DayType)} className={inputClass}>
          {DAY_TYPES.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <select value={period} onChange={e => setPeriod(e.target.value as PeriodKey | 'all')} className={inputClass}>
          <option value="all">All day</option>
          {TIME_PERIODS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
        </select>
        <input value={minFreq} onChange={e => setMinFreq(e.target.value)} placeholder="Min min" type="number" className={`${inputClass} w-20`} />
        <input value={maxFreq} onChange={e => setMaxFreq(e.target.value)} placeholder="Max min" type="number" className={`${inputClass} w-20`} />
        <span className="text-[10px] font-bold text-[var(--text-dim)]">
          {sortedRows.length} rows{isLoading ? ' · loading…' : ''}
        </span>
      </div>

      {!hasScope ? (
        <p className="text-xs font-bold text-[var(--text-dim)]">
          Pick a region or search an agency to load its routes — nothing loads by default.
        </p>
      ) : (
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="text-left border-b border-[var(--border-primary)]">
              {COLUMNS.map(({ key, label }) => (
                <th
                  key={key}
                  onClick={() => toggleSort(key)}
                  className="cursor-pointer select-none px-2 py-1.5 font-black hover:text-[var(--accent)] whitespace-nowrap"
                >
                  {label}{sortKey === key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map(r => (
              <tr key={r.key} className="border-b border-[var(--border-primary)] hover:bg-[var(--bg-btn-hover)]">
                <td className="px-2 py-1 font-bold whitespace-nowrap">{r.agencyName}</td>
                <td className="px-2 py-1 font-black whitespace-nowrap">{r.routeLabel}</td>
                <td className="px-2 py-1">{r.headsign}</td>
                <td className="px-2 py-1">{r.tier ?? '—'}</td>
                <td className="px-2 py-1 font-black whitespace-nowrap">{r.frequency != null ? `every ${r.frequency} min` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
