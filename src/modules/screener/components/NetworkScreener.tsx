import React, { useState, useEffect, useCallback } from 'react';
import { Search, Filter, GitFork, Activity } from 'lucide-react';
import { fetchAgencies, screenRoutes, fetchCorridors, fetchCorridorPerformance, AgencyMeta, ScreenRoute, Corridor, ScreenParams } from '../../../services/atlasApi';
import { CorridorMonitor } from './CorridorMonitor';

const TIER_CONFIG = [
  { id: '5',    name: 'Rapid',   color: 'cyan'    },
  { id: '8',    name: 'Freq++',  color: 'teal'    },
  { id: '10',   name: 'Freq+',   color: 'emerald' },
  { id: '15',   name: 'Freq',    color: 'blue'    },
  { id: '20',   name: 'Good',    color: 'indigo'  },
  { id: '30',   name: 'Basic',   color: 'amber'   },
  { id: '60',   name: 'Infreq',  color: 'orange'  },
];

const TIER_BADGE_CLASSES: Record<string, string> = {
  cyan:    'text-cyan-600 dark:text-cyan-400 bg-cyan-500/5 border-cyan-500/10',
  teal:    'text-teal-600 dark:text-teal-400 bg-teal-500/5 border-teal-500/10',
  emerald: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/5 border-emerald-500/10',
  blue:    'text-blue-600 dark:text-blue-400 bg-blue-500/5 border-blue-500/10',
  indigo:  'text-indigo-600 dark:text-indigo-400 bg-indigo-500/5 border-indigo-500/10',
  amber:   'text-amber-600 dark:text-amber-400 bg-amber-500/5 border-amber-500/10',
  orange:  'text-orange-600 dark:text-orange-400 bg-orange-500/5 border-orange-500/10',
};

function deriveTier(baseHeadway: number): string {
  if (baseHeadway <= 5)  return '5';
  if (baseHeadway <= 8)  return '8';
  if (baseHeadway <= 10) return '10';
  if (baseHeadway <= 15) return '15';
  if (baseHeadway <= 20) return '20';
  if (baseHeadway <= 30) return '30';
  return '60';
}

function minsToTime(mins: number): string {
  const h = Math.floor(mins / 60).toString().padStart(2, '0');
  const m = (mins % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
}

function timeToMins(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function formatSpan(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const suffix = h >= 12 ? 'pm' : 'am';
  const displayH = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return m === 0 ? `${displayH}${suffix}` : `${displayH}:${m.toString().padStart(2, '0')}${suffix}`;
}

export function NetworkScreener() {
  const [tab, setTab]                         = useState<'routes' | 'corridors' | 'monitoring'>('routes');
  const [agencies, setAgencies]               = useState<AgencyMeta[]>([]);
  const [loadingAgencies, setLoadingAgencies] = useState(true);
  const [agencyError, setAgencyError]         = useState<string | null>(null);
  const [selectedAgency, setSelectedAgency]   = useState('');
  const [maxHeadway, setMaxHeadway]           = useState(15);
  const [windowStart, setWindowStart]         = useState(minsToTime(420));   // 7:00am
  const [windowEnd, setWindowEnd]             = useState(minsToTime(1140));  // 7:00pm
  const [dayType, setDayType]                 = useState<ScreenParams['dayType']>('Weekday');
  const [directions, setDirections]           = useState<'one' | 'both'>('one');
  const [results, setResults]                 = useState<ScreenRoute[] | null>(null);
  const [loading, setLoading]                 = useState(false);
  const [screenError, setScreenError]         = useState<string | null>(null);
  const [searchQuery, setSearchQuery]         = useState('');
  const [corridors, setCorridors]             = useState<Corridor[] | null>(null);
  const [corridorLoading, setCorridorLoading] = useState(false);
  const [corridorError, setCorridorError]     = useState<string | null>(null);
  const [corridorSearch, setCorridorSearch]   = useState('');

  useEffect(() => {
    fetchAgencies()
      .then(data => {
        setAgencies(data);
        if (data.length > 0) setSelectedAgency(data[0].slug);
      })
      .catch(() => setAgencyError('Could not load agencies from server'))
      .finally(() => setLoadingAgencies(false));
  }, []);

  const runScreen = useCallback(async () => {
    if (!selectedAgency) return;
    setLoading(true);
    setScreenError(null);
    try {
      const data = await screenRoutes({
        agency:      selectedAgency,
        maxHeadway,
        windowStart: timeToMins(windowStart),
        windowEnd:   timeToMins(windowEnd),
        dayType,
        directions,
      });
      setResults(data.routes);
    } catch (e) {
      setScreenError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [selectedAgency, maxHeadway, windowStart, windowEnd, dayType, directions]);

  const runCorridors = useCallback(async () => {
    if (!selectedAgency) return;
    setCorridorLoading(true);
    setCorridorError(null);
    try {
      const data = await fetchCorridors({
        agency:      selectedAgency,
        maxHeadway,
        windowStart: timeToMins(windowStart),
        windowEnd:   timeToMins(windowEnd),
        dayType,
        minRoutes:   2,
      });
      setCorridors(data.corridors);
    } catch (e) {
      setCorridorError((e as Error).message);
    } finally {
      setCorridorLoading(false);
    }
  }, [selectedAgency, maxHeadway, windowStart, windowEnd, dayType]);

  const filtered = results
    ? results.filter(r =>
        (r.route_short_name ?? '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (r.route_long_name  ?? '').toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : null;

  const filteredCorridors = corridors
    ? corridors.filter(c =>
        (c.stop_a_name ?? c.stop_a_id).toLowerCase().includes(corridorSearch.toLowerCase()) ||
        (c.stop_b_name ?? c.stop_b_id).toLowerCase().includes(corridorSearch.toLowerCase()) ||
        c.route_short_names.some(n => n.toLowerCase().includes(corridorSearch.toLowerCase())),
      )
    : null;

  return (
    <div className="space-y-6">
      {/* Tab bar */}
      <div className="flex gap-1 bg-[var(--item-bg)] p-1 rounded-xl border border-[var(--border)] w-fit">
        <button
          onClick={() => setTab('routes')}
          className={`px-5 py-2 rounded-lg text-[10px] font-bold transition-all flex items-center gap-2 ${
            tab === 'routes'
              ? 'bg-[var(--bg)] text-indigo-600 dark:text-indigo-400 shadow-sm border border-[var(--border)]'
              : 'text-[var(--text-muted)] hover:text-[var(--fg)]'
          }`}
        >
          <Filter className="w-3 h-3" />
          Route Screener
        </button>
        <button
          onClick={() => setTab('corridors')}
          className={`px-5 py-2 rounded-lg text-[10px] font-bold transition-all flex items-center gap-2 ${
            tab === 'corridors'
              ? 'bg-[var(--bg)] text-indigo-600 dark:text-indigo-400 shadow-sm border border-[var(--border)]'
              : 'text-[var(--text-muted)] hover:text-[var(--fg)]'
          }`}
        >
          <GitFork className="w-3 h-3" />
          Corridors
        </button>
        <button
          onClick={() => setTab('monitoring')}
          className={`px-5 py-2 rounded-lg text-[10px] font-bold transition-all flex items-center gap-2 ${
            tab === 'monitoring'
              ? 'bg-[var(--bg)] text-indigo-600 dark:text-indigo-400 shadow-sm border border-[var(--border)]'
              : 'text-[var(--text-muted)] hover:text-[var(--fg)]'
          }`}
        >
          <Activity className="w-3 h-3" />
          Monitoring
        </button>
      </div>

      {/* Filter panel */}
      <div className="precision-panel p-6 space-y-5">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {/* Agency */}
          <div className="col-span-2">
            <label className="atlas-label text-[9px] mb-1 block">Agency</label>
            {agencyError ? (
              <p className="text-xs text-red-500">{agencyError}</p>
            ) : (
              <select
                value={selectedAgency}
                onChange={e => setSelectedAgency(e.target.value)}
                disabled={loadingAgencies}
                className="w-full px-3 py-2.5 bg-[var(--item-bg)] border border-[var(--border)] rounded-xl text-sm font-bold focus:outline-none focus:border-indigo-500/50 disabled:opacity-50"
              >
                {loadingAgencies
                  ? <option>Loading…</option>
                  : agencies.map(a => (
                      <option key={a.slug} value={a.slug}>{a.display_name}</option>
                    ))
                }
              </select>
            )}
          </div>

          {/* Max Headway */}
          <div>
            <label className="atlas-label text-[9px] mb-1 block">Max Headway (min)</label>
            <input
              type="number"
              min={1}
              max={120}
              value={maxHeadway}
              onChange={e => setMaxHeadway(parseInt(e.target.value, 10) || 15)}
              className="w-full px-3 py-2.5 bg-[var(--item-bg)] border border-[var(--border)] rounded-xl text-sm font-bold focus:outline-none focus:border-indigo-500/50"
            />
          </div>

          {/* Window Start */}
          <div>
            <label className="atlas-label text-[9px] mb-1 block">Window Start</label>
            <input
              type="time"
              value={windowStart}
              onChange={e => setWindowStart(e.target.value)}
              className="w-full px-3 py-2.5 bg-[var(--item-bg)] border border-[var(--border)] rounded-xl text-sm font-bold focus:outline-none focus:border-indigo-500/50"
            />
          </div>

          {/* Window End */}
          <div>
            <label className="atlas-label text-[9px] mb-1 block">Window End</label>
            <input
              type="time"
              value={windowEnd}
              onChange={e => setWindowEnd(e.target.value)}
              className="w-full px-3 py-2.5 bg-[var(--item-bg)] border border-[var(--border)] rounded-xl text-sm font-bold focus:outline-none focus:border-indigo-500/50"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 pt-1">
          <div className="flex flex-wrap gap-3">
            {/* Day type */}
            <div className="flex gap-1 bg-[var(--bg)] p-1 rounded-xl border border-[var(--border)]">
              {(['Weekday', 'Saturday', 'Sunday'] as const).map(d => (
                <button
                  key={d}
                  onClick={() => setDayType(d)}
                  className={`px-4 py-1.5 rounded-lg text-[10px] font-bold transition-all ${
                    dayType === d
                      ? 'bg-[var(--item-bg)] text-indigo-600 dark:text-indigo-400 shadow-sm border border-[var(--border)]'
                      : 'text-[var(--text-muted)] hover:text-[var(--fg)]'
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>

            {/* Directions — routes tab only */}
            {tab === 'routes' && (
              <div className="flex gap-1 bg-[var(--bg)] p-1 rounded-xl border border-[var(--border)]">
                {([['one', 'At least one direction'], ['both', 'Both directions']] as const).map(([val, label]) => (
                  <button
                    key={val}
                    onClick={() => setDirections(val)}
                    className={`px-4 py-1.5 rounded-lg text-[10px] font-bold transition-all ${
                      directions === val
                        ? 'bg-[var(--item-bg)] text-indigo-600 dark:text-indigo-400 shadow-sm border border-[var(--border)]'
                        : 'text-[var(--text-muted)] hover:text-[var(--fg)]'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={tab === 'corridors' ? runCorridors : runScreen}
            disabled={(tab === 'corridors' ? corridorLoading : loading) || !selectedAgency || loadingAgencies}
            className="px-6 py-2 bg-indigo-500 text-white rounded-xl text-xs font-bold flex items-center gap-2 hover:bg-indigo-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {(tab === 'corridors' ? corridorLoading : loading)
              ? <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
              : tab === 'corridors' ? <GitFork className="w-3.5 h-3.5" /> : <Filter className="w-3.5 h-3.5" />
            }
            {tab === 'corridors' ? 'Find Corridors' : 'Screen'}
          </button>
        </div>
      </div>

      {screenError && tab === 'routes' && (
        <p className="text-xs text-red-500 font-medium px-1">{screenError}</p>
      )}
      {corridorError && tab === 'corridors' && (
        <p className="text-xs text-red-500 font-medium px-1">{corridorError}</p>
      )}

      {/* Corridors results */}
      {tab === 'corridors' && filteredCorridors !== null && (
        <>
          <div className="flex items-center justify-between gap-6">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
              <input
                value={corridorSearch}
                onChange={e => setCorridorSearch(e.target.value)}
                placeholder="Filter by stop name or route…"
                className="w-full pl-12 pr-4 py-3 bg-[var(--item-bg)] border border-[var(--border)] rounded-xl focus:outline-none focus:border-indigo-500/50 transition-all font-medium text-sm text-[var(--fg)] shadow-sm"
              />
            </div>
            <div className="atlas-label">
              Corridors: <span className="text-indigo-600 dark:text-indigo-400 atlas-mono font-black">{filteredCorridors.length}</span>
            </div>
          </div>

          <div className="precision-panel overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[var(--item-bg)] border-b border-[var(--border)]">
                    <th className="px-6 py-4 atlas-label">Segment</th>
                    <th className="px-6 py-4 atlas-label">Routes</th>
                    <th className="px-6 py-4 atlas-label text-right">Combined Trips</th>
                    <th className="px-6 py-4 atlas-label text-right">Avg Headway</th>
                    <th className="px-6 py-4 atlas-label text-right">Peak Headway</th>
                    <th className="px-6 py-4 atlas-label text-right">Reliability</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {filteredCorridors.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-sm text-[var(--text-muted)]">
                        No shared corridors found with these criteria.
                      </td>
                    </tr>
                  ) : filteredCorridors.map(c => {
                    const score = c.reliability_score != null ? Math.round(parseFloat(c.reliability_score)) : null;
                    return (
                      <tr key={`${c.link_id}`} className="hover:bg-[var(--item-bg)] transition-colors">
                        <td className="px-6 py-4">
                          <div className="text-sm font-semibold text-[var(--fg)]">
                            {c.stop_a_name ?? c.stop_a_id}
                          </div>
                          <div className="text-[10px] text-[var(--text-muted)] atlas-mono mt-0.5">
                            → {c.stop_b_name ?? c.stop_b_id}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-wrap gap-1">
                            {c.route_short_names.map(n => (
                              <span key={n} className="bg-indigo-600/10 text-indigo-600 dark:text-indigo-400 atlas-mono font-bold text-xs px-2 py-0.5 rounded border border-indigo-500/20">
                                {n}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm atlas-mono font-medium text-right text-[var(--fg)]">
                          {c.trip_count}
                        </td>
                        <td className="px-6 py-4 text-sm atlas-mono font-medium text-right text-[var(--fg)]">
                          {c.avg_headway ? `${Math.round(parseFloat(c.avg_headway))}m` : '—'}
                        </td>
                        <td className="px-6 py-4 text-sm atlas-mono font-bold text-right text-indigo-500">
                          {c.peak_headway ? `${Math.round(parseFloat(c.peak_headway))}m` : '—'}
                        </td>
                        <td className="px-6 py-4 text-right">
                          {score != null ? (
                            <div className="flex items-center justify-end gap-2">
                              <div className="w-12 h-1 bg-[var(--item-bg)] rounded-full overflow-hidden border border-[var(--border)]">
                                <div
                                  className={`h-full rounded-full ${score > 80 ? 'bg-emerald-500' : score > 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                                  style={{ width: `${score}%` }}
                                />
                              </div>
                              <span className={`text-[10px] atlas-mono font-bold ${score > 80 ? 'text-emerald-600 dark:text-emerald-400' : score > 50 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}`}>
                                {score}%
                              </span>
                            </div>
                          ) : (
                            <span className="text-[var(--text-muted)] text-xs">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Route screener results */}
      {tab === 'routes' && filtered !== null && (
        <>
          <div className="flex items-center justify-between gap-6">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
              <input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Filter by route name…"
                className="w-full pl-12 pr-4 py-3 bg-[var(--item-bg)] border border-[var(--border)] rounded-xl focus:outline-none focus:border-indigo-500/50 transition-all font-medium text-sm text-[var(--fg)] shadow-sm"
              />
            </div>
            <div className="atlas-label">
              Results: <span className="text-indigo-600 dark:text-indigo-400 atlas-mono font-black">{filtered.length}</span>
            </div>
          </div>

          <div className="precision-panel overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[var(--item-bg)] border-b border-[var(--border)]">
                    <th className="px-6 py-4 atlas-label">Route</th>
                    <th className="px-6 py-4 atlas-label">Mode</th>
                    <th className="px-6 py-4 atlas-label">Tier</th>
                    <th className="px-6 py-4 atlas-label text-right">Trips</th>
                    <th className="px-6 py-4 atlas-label text-right">Avg</th>
                    <th className="px-6 py-4 atlas-label text-right">Worst</th>
                    <th className="px-6 py-4 atlas-label">Span</th>
                    <th className="px-6 py-4 atlas-label text-right">Reliability</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-6 py-12 text-center text-sm text-[var(--text-muted)]">
                        No routes match these criteria.
                      </td>
                    </tr>
                  ) : filtered.map(r => {
                    const tier   = r.tier ?? deriveTier(parseFloat(r.base_headway));
                    const config = TIER_CONFIG.find(c => c.id === tier);
                    const score  = r.reliability_score != null ? Math.round(parseFloat(r.reliability_score)) : null;
                    return (
                      <tr key={r.gtfs_route_id} className="hover:bg-[var(--item-bg)] transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-4">
                            <span className="bg-indigo-600/10 text-indigo-600 dark:text-indigo-400 atlas-mono font-bold text-xs px-2 py-1 rounded border border-indigo-500/20">
                              {r.route_short_name}
                            </span>
                            <span className="font-semibold text-sm text-[var(--fg)]">
                              {r.route_long_name || `Route ${r.route_short_name}`}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
                            {r.mode_category || 'Transit'}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          {config && (
                            <span className={`font-bold text-[9px] px-2 py-1 rounded border shadow-sm ${TIER_BADGE_CLASSES[config.color]}`}>
                              {config.name}
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-sm atlas-mono font-medium text-right text-[var(--fg)]">
                          {r.trip_count}
                        </td>
                        <td className="px-6 py-4 text-sm atlas-mono font-medium text-right text-[var(--fg)]">
                          {r.avg_headway ? `${Math.round(parseFloat(r.avg_headway))}m` : '—'}
                        </td>
                        <td className="px-6 py-4 text-sm atlas-mono font-medium text-right text-indigo-500 font-bold">
                          {r.base_headway ? `${Math.round(parseFloat(r.base_headway))}m` : '—'}
                        </td>
                        <td className="px-6 py-4 text-[10px] text-[var(--text-muted)] atlas-mono">
                          {formatSpan(r.service_span_start)}–{formatSpan(r.service_span_end)}
                        </td>
                        <td className="px-6 py-4 text-right">
                          {score != null ? (
                            <div className="flex items-center justify-end gap-2">
                              <div className="w-12 h-1 bg-[var(--item-bg)] rounded-full overflow-hidden border border-[var(--border)]">
                                <div
                                  className={`h-full rounded-full ${score > 80 ? 'bg-emerald-500' : score > 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                                  style={{ width: `${score}%` }}
                                />
                              </div>
                              <span className={`text-[10px] atlas-mono font-bold ${score > 80 ? 'text-emerald-600 dark:text-emerald-400' : score > 50 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}`}>
                                {score}%
                              </span>
                            </div>
                          ) : (
                            <span className="text-[var(--text-muted)] text-xs">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Monitoring tab */}
      {tab === 'monitoring' && (
        <CorridorMonitor agency={selectedAgency} />
      )}
    </div>
  );
}
