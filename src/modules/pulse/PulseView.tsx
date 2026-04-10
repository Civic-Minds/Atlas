import React, { useState, useEffect, useMemo } from 'react';
import { Activity, AlertTriangle, CheckCircle2, Clock, Plus, TrendingDown, LayoutGrid, Route } from 'lucide-react';
import { ModuleHeader } from '../../components/ModuleHeader';
import { fetchLiveRoutes, fetchRouteHealth, fetchNetworkPulse, fetchGapDistribution, RouteHealthResponse, RouteHealthHour, NetworkPulseRoute, GapDistributionResponse } from '../../services/atlasApi';

const AGENCIES = [
  { id: 'ttc', label: 'TTC' },
  { id: 'mbta', label: 'MBTA' },
  { id: 'trimet', label: 'TriMet' },
  { id: 'metrotransit', label: 'Metro Transit' },
  { id: 'translink', label: 'TransLink' },
  { id: 'octranspo', label: 'OC Transpo' },
  { id: 'septa', label: 'SEPTA' },
  { id: 'mtabus', label: 'MTA Bus' },
  { id: 'wego', label: 'WeGo' },
  { id: 'edmonton', label: 'Edmonton' },
  { id: 'mcts', label: 'MCTS' },
  { id: 'gcrta', label: 'GCRTA' },
  { id: 'sta', label: 'STA' },
  { id: 'drt', label: 'DRT' },
  { id: 'kcm', label: 'KCM' },
  { id: 'soundtransit', label: 'Sound Transit' },
  { id: 'sdmts', label: 'SD MTS' },
];

const HOURS = Array.from({ length: 18 }, (_, i) => i + 5); // 5am–10pm

function hourLabel(h: number): string {
  if (h === 0 || h === 24) return '12a';
  if (h === 12) return '12p';
  return h < 12 ? `${h}a` : `${h - 12}p`;
}

function headwayColor(mins: number | null): string {
  if (mins === null) return 'bg-[var(--border)] opacity-30';
  if (mins <= 6)  return 'bg-emerald-500';
  if (mins <= 10) return 'bg-yellow-400';
  if (mins <= 15) return 'bg-orange-400';
  return 'bg-red-500';
}

function headwayTextColor(mins: number | null): string {
  if (mins === null) return 'text-[var(--text-muted)]';
  if (mins <= 6)  return 'text-emerald-400';
  if (mins <= 10) return 'text-yellow-400';
  if (mins <= 15) return 'text-orange-400';
  return 'text-red-400';
}

function dayLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' });
}

// ── Gap Distribution Panel ────────────────────────────────────────────────────

const BUCKET_ORDER = ['bunching', '2–5m', '5–8m', '8–12m', '12–20m', '20–30m', '30m+'];

function bucketColor(bucket: string): string {
  switch (bucket) {
    case 'bunching': return 'bg-fuchsia-500';
    case '2–5m':    return 'bg-emerald-500';
    case '5–8m':    return 'bg-emerald-400';
    case '8–12m':   return 'bg-yellow-400';
    case '12–20m':  return 'bg-orange-400';
    case '20–30m':  return 'bg-red-500';
    case '30m+':    return 'bg-red-700';
    default:        return 'bg-[var(--border)]';
  }
}

function GapDistributionPanel({ d }: { d: GapDistributionResponse }) {
  const maxCount = Math.max(...d.buckets.map(b => b.count), 1);
  const ordered = BUCKET_ORDER.map(label => d.buckets.find(b => b.bucket === label) ?? { bucket: label, count: 0 });

  const diagnosisColor = d.diagnosis === 'bunching' ? 'border-fuchsia-500 bg-fuchsia-500/5'
                       : d.diagnosis === 'capacity' ? 'border-red-500 bg-red-500/5'
                       : 'border-[var(--border)]';
  const diagnosisIcon  = d.diagnosis === 'bunching' ? '⚡' : d.diagnosis === 'capacity' ? '🔴' : '—';
  const diagnosisText  = d.diagnosis === 'bunching'
    ? `Bunching detected (${d.bunchingPct}% of gaps < 2 min). Vehicles are platooning. Adding buses may not help — spacing interventions (holding points, headway control) are likely more effective.`
    : d.diagnosis === 'capacity'
    ? `Consistent long gaps (${d.desertPct}% of gaps > 20 min). Pattern suggests genuine capacity shortage at this hour — more vehicles or shorter turns would reduce wait times.`
    : 'Insufficient gap data to diagnose. Check back after more service hours are collected.';

  return (
    <div className="precision-panel overflow-hidden mb-8">
      <div className="bg-[var(--item-bg)] px-6 py-4 border-b border-[var(--border)] flex items-center justify-between">
        <span className="atlas-label">Gap Distribution — 7-Day · All Stops</span>
        <div className="flex items-center gap-4 text-[9px] text-[var(--text-muted)]">
          <span>median <span className="font-black text-[var(--fg)]">{d.median !== null ? `${d.median}m` : '—'}</span></span>
          <span>p75 <span className="font-black text-[var(--fg)]">{d.p75 !== null ? `${d.p75}m` : '—'}</span></span>
          <span>p90 <span className="font-black text-[var(--fg)]">{d.p90 !== null ? `${d.p90}m` : '—'}</span></span>
          <span className="text-[var(--text-muted)]">{d.totalGaps.toLocaleString()} gaps</span>
        </div>
      </div>

      <div className="p-6">
        {/* Bar chart */}
        <div className="space-y-2 mb-6">
          {ordered.map(({ bucket, count }) => {
            const pct = count > 0 ? (count / maxCount) * 100 : 0;
            const sharePct = d.totalGaps > 0 ? Math.round((count / d.totalGaps) * 100) : 0;
            return (
              <div key={bucket} className="flex items-center gap-3">
                <div className="w-16 text-[9px] atlas-label text-right text-[var(--text-muted)] shrink-0">{bucket}</div>
                <div className="flex-1 h-5 bg-[var(--item-bg)] rounded overflow-hidden">
                  <div
                    className={`h-full ${bucketColor(bucket)} transition-all`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="w-20 text-[9px] font-bold text-[var(--text-muted)] shrink-0">
                  {count > 0 ? `${count.toLocaleString()} (${sharePct}%)` : '—'}
                </div>
              </div>
            );
          })}
        </div>

        {/* Diagnosis */}
        <div className={`border-l-4 rounded-r-xl p-4 ${diagnosisColor}`}>
          <div className="text-[10px] atlas-label mb-1 text-[var(--text-muted)]">Diagnosis</div>
          <p className="text-sm font-bold text-[var(--fg)] leading-relaxed">
            {diagnosisIcon} {diagnosisText}
          </p>
        </div>
      </div>
    </div>
  );
}

type TabId = 'network' | 'route';

// ── Network Overview helpers ──────────────────────────────────────────────────

type SortKey = 'worstGap' | 'avgGap' | 'currentVehicles' | 'routeId';

function sortRoutes(routes: NetworkPulseRoute[], key: SortKey, asc: boolean): NetworkPulseRoute[] {
  return [...routes].sort((a, b) => {
    let av: number | string | null;
    let bv: number | string | null;
    if (key === 'routeId') { av = a.routeId; bv = b.routeId; }
    else { av = a[key]; bv = b[key]; }
    if (av === null && bv === null) return 0;
    if (av === null) return 1;
    if (bv === null) return -1;
    if (typeof av === 'string' && typeof bv === 'string') {
      const na = parseInt(av, 10), nb = parseInt(bv, 10);
      const cmp = !isNaN(na) && !isNaN(nb) ? na - nb : av.localeCompare(bv);
      return asc ? cmp : -cmp;
    }
    const cmp = (av as number) - (bv as number);
    return asc ? cmp : -cmp;
  });
}

function GapBar({ value, max }: { value: number | null; max: number }) {
  if (value === null) return <span className="text-[var(--text-muted)] text-[10px]">—</span>;
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 rounded-full bg-[var(--border)] overflow-hidden">
        <div
          className={`h-full rounded-full ${value <= 6 ? 'bg-emerald-500' : value <= 10 ? 'bg-yellow-400' : value <= 15 ? 'bg-orange-400' : 'bg-red-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={`text-[10px] font-bold ${headwayTextColor(value)}`}>{value}m</span>
    </div>
  );
}

export default function PulseView() {
  const [tab, setTab] = useState<TabId>('network');
  const [agency, setAgency] = useState('ttc');

  // Network tab state
  const [networkData, setNetworkData] = useState<NetworkPulseRoute[] | null>(null);
  const [networkLoading, setNetworkLoading] = useState(false);
  const [networkError, setNetworkError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('worstGap');
  const [sortAsc, setSortAsc] = useState(false);
  const [networkTs, setNetworkTs] = useState<string | null>(null);

  // Route tab state
  const [routes, setRoutes] = useState<string[]>([]);
  const [selectedRoute, setSelectedRoute] = useState('');
  const [data, setData] = useState<RouteHealthResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Gap distribution state
  const [gapData, setGapData] = useState<GapDistributionResponse | null>(null);
  const [gapLoading, setGapLoading] = useState(false);

  // Load network overview when agency changes or tab switches to network
  useEffect(() => {
    if (tab !== 'network') return;
    setNetworkData(null);
    setNetworkError(null);
    setNetworkLoading(true);
    fetchNetworkPulse(agency)
      .then(d => { setNetworkData(d.routes); setNetworkTs(d.ts); })
      .catch(e => setNetworkError(e.message))
      .finally(() => setNetworkLoading(false));
  }, [agency, tab]);

  useEffect(() => {
    if (tab !== 'route') return;
    setData(null);
    setSelectedRoute('');
    fetchLiveRoutes(agency)
      .then(r => { setRoutes(r); if (r.length > 0) setSelectedRoute(r[0]); })
      .catch(e => setError(e.message));
  }, [agency, tab]);

  useEffect(() => {
    if (!selectedRoute) return;
    setLoading(true);
    setError(null);
    fetchRouteHealth(agency, selectedRoute)
      .then(d => setData(d))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [agency, selectedRoute]);

  useEffect(() => {
    if (!selectedRoute) return;
    setGapData(null);
    setGapLoading(true);
    fetchGapDistribution(agency, selectedRoute)
      .then(d => setGapData(d))
      .catch(() => {/* non-fatal — panel just stays hidden */})
      .finally(() => setGapLoading(false));
  }, [agency, selectedRoute]);

  // Build a map: day → hour → data
  const grid = useMemo(() => {
    if (!data) return { days: [], cells: {} };
    const days = [...new Set(data.hourly.map(h => h.day))].sort();
    const cells: Record<string, Record<number, RouteHealthHour>> = {};
    for (const row of data.hourly) {
      if (!cells[row.day]) cells[row.day] = {};
      cells[row.day][row.hour] = row;
    }
    return { days, cells };
  }, [data]);

  // Average headway per hour across all days (for the summary bar)
  const hourlyAvg = useMemo(() => {
    if (!data) return {};
    const sums: Record<number, number[]> = {};
    for (const row of data.hourly) {
      if (row.estHeadwayMins === null) continue;
      if (!sums[row.hour]) sums[row.hour] = [];
      sums[row.hour].push(row.estHeadwayMins);
    }
    const result: Record<number, number> = {};
    for (const [h, vals] of Object.entries(sums)) {
      result[parseInt(h)] = Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
    }
    return result;
  }, [data]);

  const prescription = useMemo(() => {
    if (!data?.summary.worstAvgGap || !data?.summary.worstHour) return null;
    const gap = data.summary.worstAvgGap;
    const target = data.summary.bestAvgGap ?? 5;
    const vehiclesNeeded = Math.ceil(60 / target);
    const vehiclesAtWorst = Math.round(60 / gap);
    const toAdd = Math.max(1, vehiclesNeeded - vehiclesAtWorst);
    return { gap, hour: data.summary.worstHour, toAdd, target };
  }, [data]);

  // Sorted network routes
  const sortedNetwork = useMemo(() => {
    if (!networkData) return [];
    return sortRoutes(networkData, sortKey, sortAsc);
  }, [networkData, sortKey, sortAsc]);

  const networkMax = useMemo(() => {
    if (!networkData) return 30;
    const max = Math.max(...networkData.map(r => r.worstGap ?? 0));
    return Math.max(max, 15);
  }, [networkData]);

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(a => !a);
    else { setSortKey(key); setSortAsc(key === 'routeId'); }
  }

  function SortIndicator({ k }: { k: SortKey }) {
    if (sortKey !== k) return <span className="opacity-20">↕</span>;
    return <span>{sortAsc ? '↑' : '↓'}</span>;
  }

  return (
    <div className="module-container">
      <ModuleHeader
        title="Route Health"
        badge={{ label: 'Live · 7-Day' }}
      />

      {/* Agency picker + tab switcher */}
      <div className="flex flex-col gap-4 mb-8">
        <div className="flex flex-col gap-1">
          <span className="text-[9px] atlas-label opacity-50">Agency</span>
          <div className="flex items-center gap-2 flex-wrap">
            {AGENCIES.map(a => (
              <button
                key={a.id}
                onClick={() => setAgency(a.id)}
                className={`px-3 py-1.5 rounded-lg border text-[10px] font-bold transition-all ${
                  agency === a.id
                    ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-500'
                    : 'bg-[var(--item-bg)] border-[var(--border)] text-[var(--text-muted)] hover:border-indigo-500/30'
                }`}
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab switcher */}
        <div className="flex items-center gap-1 p-1 bg-[var(--item-bg)] border border-[var(--border)] rounded-xl w-fit">
          {([['network', 'Network Overview', LayoutGrid], ['route', 'Route Detail', Route]] as const).map(([id, label, Icon]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                tab === id
                  ? 'bg-indigo-500 text-white shadow-sm'
                  : 'text-[var(--text-muted)] hover:text-[var(--fg)]'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Network Overview Tab ─────────────────────────────────────────────── */}
      {tab === 'network' && (
        <>
          {networkLoading && (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
            </div>
          )}
          {networkError && (
            <div className="flex items-center gap-2 text-red-500 text-sm py-8">
              <AlertTriangle className="w-4 h-4" /> {networkError}
            </div>
          )}
          {sortedNetwork.length > 0 && (
            <div className="precision-panel overflow-hidden">
              <div className="bg-[var(--item-bg)] px-6 py-4 border-b border-[var(--border)] flex items-center justify-between">
                <div>
                  <span className="atlas-label">{networkData?.length} routes · ranked by worst observed gap</span>
                  {networkTs && (
                    <span className="text-[9px] text-[var(--text-muted)] ml-3">
                      as of {new Date(networkTs).toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-[9px] text-[var(--text-muted)]">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-emerald-500 inline-block" /> ≤6m</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-yellow-400 inline-block" /> ≤10m</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-orange-400 inline-block" /> ≤15m</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-red-500 inline-block" /> &gt;15m</span>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-[var(--border)]">
                      {([
                        ['routeId',        'Route'],
                        ['currentVehicles','Now'],
                        ['worstGap',       'Worst Gap'],
                        ['avgGap',         'Avg Gap'],
                      ] as [SortKey, string][]).map(([key, label]) => (
                        <th
                          key={key}
                          onClick={() => handleSort(key)}
                          className="px-4 py-3 text-[9px] atlas-label opacity-50 hover:opacity-100 cursor-pointer select-none whitespace-nowrap"
                        >
                          {label} <SortIndicator k={key} />
                        </th>
                      ))}
                      <th className="px-4 py-3 text-[9px] atlas-label opacity-50 whitespace-nowrap">Worst Hour</th>
                      <th className="px-4 py-3 text-[9px] atlas-label opacity-50 whitespace-nowrap">Detail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedNetwork.map((r, i) => (
                      <tr
                        key={r.routeId}
                        className={`border-b border-[var(--border)]/50 hover:bg-[var(--item-bg)] transition-colors ${i % 2 === 0 ? '' : 'bg-[var(--item-bg)]/40'}`}
                      >
                        <td className="px-4 py-2.5">
                          <span className="atlas-mono text-xs font-black">{r.routeId}</span>
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-1.5">
                            <Activity className={`w-3 h-3 ${r.currentVehicles > 0 ? 'text-emerald-500' : 'text-[var(--text-muted)]'}`} />
                            <span className={`text-xs font-bold ${r.currentVehicles > 0 ? 'text-[var(--fg)]' : 'text-[var(--text-muted)]'}`}>
                              {r.currentVehicles}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5">
                          <GapBar value={r.worstGap} max={networkMax} />
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={`text-[10px] font-bold ${headwayTextColor(r.avgGap)}`}>
                            {r.avgGap !== null ? `${r.avgGap}m` : '—'}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="text-[10px] text-[var(--text-muted)]">
                            {r.worstHour !== null ? hourLabel(r.worstHour) : '—'}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          <button
                            onClick={() => { setSelectedRoute(r.routeId); setTab('route'); }}
                            className="text-[9px] font-bold text-indigo-400 hover:text-indigo-300 transition-colors"
                          >
                            Heatmap →
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Route Detail Tab ─────────────────────────────────────────────────── */}
      {tab === 'route' && (
        <>
          {routes.length > 0 && (
            <div className="flex items-center gap-2 mb-8 overflow-x-auto no-scrollbar">
              {routes.map(r => (
                <button
                  key={r}
                  onClick={() => setSelectedRoute(r)}
                  className={`px-4 py-2 rounded-xl border text-xs font-black transition-all shrink-0 ${
                    selectedRoute === r
                      ? 'bg-indigo-500 border-indigo-500 text-white'
                      : 'bg-[var(--item-bg)] border-[var(--border)] text-[var(--text-muted)] hover:border-indigo-500/50'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          )}

          {loading && (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 text-red-500 text-sm py-8">
              <AlertTriangle className="w-4 h-4" /> {error}
            </div>
          )}

          {data && !loading && (
        <>
          {/* Summary stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <div className="precision-panel p-5 border-l-4 border-emerald-500">
              <div className="flex items-center gap-2 mb-3">
                <Activity className="w-4 h-4 text-emerald-500" />
                <span className="atlas-label">Right Now</span>
              </div>
              <div className="text-3xl font-black atlas-mono">{data.currentVehicles}</div>
              <div className="text-[10px] text-[var(--text-muted)] mt-1">vehicles active</div>
              {data.currentVehicles > 0 && (
                <div className="text-[10px] font-bold text-emerald-400 mt-1">
                  ~{Math.round(60 / data.currentVehicles * 10) / 10}m est. headway
                </div>
              )}
            </div>

            <div className="precision-panel p-5 border-l-4 border-indigo-500">
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle2 className="w-4 h-4 text-indigo-500" />
                <span className="atlas-label">Best Hour</span>
              </div>
              <div className="text-3xl font-black atlas-mono">
                {data.summary.bestHour !== null ? hourLabel(data.summary.bestHour) : '—'}
              </div>
              <div className={`text-[10px] font-bold mt-1 ${headwayTextColor(data.summary.bestAvgGap)}`}>
                {data.summary.bestAvgGap !== null ? `${data.summary.bestAvgGap}m avg gap` : ''}
              </div>
            </div>

            <div className="precision-panel p-5 border-l-4 border-red-500">
              <div className="flex items-center gap-2 mb-3">
                <Clock className="w-4 h-4 text-red-500" />
                <span className="atlas-label">Worst Hour</span>
              </div>
              <div className="text-3xl font-black atlas-mono text-red-500">
                {data.summary.worstHour !== null ? hourLabel(data.summary.worstHour) : '—'}
              </div>
              <div className="text-[10px] font-bold text-red-400 mt-1">
                {data.summary.worstAvgGap !== null ? `${data.summary.worstAvgGap}m avg gap` : ''}
              </div>
            </div>

            <div className="precision-panel p-5 border-l-4 border-amber-500">
              <div className="flex items-center gap-2 mb-3">
                <TrendingDown className="w-4 h-4 text-amber-500" />
                <span className="atlas-label">Gap Spread</span>
              </div>
              {data.summary.worstAvgGap && data.summary.bestAvgGap ? (
                <>
                  <div className="text-3xl font-black atlas-mono text-amber-500">
                    {Math.round((data.summary.worstAvgGap - data.summary.bestAvgGap) * 10) / 10}m
                  </div>
                  <div className="text-[10px] text-[var(--text-muted)] mt-1">best vs. worst spread</div>
                </>
              ) : <div className="text-3xl font-black atlas-mono">—</div>}
            </div>
          </div>

          {/* Prescription card */}
          {prescription && (
            <div className="precision-panel mb-8 border-l-4 border-red-500 bg-red-500/5 p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-[10px] atlas-label text-red-500 mb-2">Service Prescription</div>
                  <p className="text-sm font-bold text-[var(--fg)] leading-relaxed">
                    Route <span className="atlas-mono text-red-400">{data.route}</span> averages a{' '}
                    <span className="text-red-400 font-black">{prescription.gap}m gap</span> at{' '}
                    <span className="font-black">{hourLabel(prescription.hour)}</span> — the worst hour of the week.
                    Adding <span className="text-emerald-400 font-black">~{prescription.toAdd} vehicle{prescription.toAdd !== 1 ? 's' : ''}</span> during
                    this window would bring headway down to ~{Math.round(prescription.target)}m, matching peak-hour performance.
                  </p>
                </div>
                <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-black px-4 py-3 rounded-xl shrink-0">
                  <Plus className="w-4 h-4" />
                  +{prescription.toAdd} vehicles
                </div>
              </div>
            </div>
          )}

          {/* Gap distribution */}
          {gapLoading && (
            <div className="precision-panel p-6 mb-8 flex items-center gap-3 text-[var(--text-muted)]">
              <div className="w-4 h-4 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin shrink-0" />
              <span className="text-xs">Analysing gap distribution…</span>
            </div>
          )}
          {gapData && !gapLoading && gapData.totalGaps >= 20 && (
            <GapDistributionPanel d={gapData} />
          )}

          {/* Heatmap */}
          <div className="precision-panel overflow-hidden mb-8">
            <div className="bg-[var(--item-bg)] px-6 py-4 border-b border-[var(--border)] flex items-center justify-between">
              <span className="atlas-label">7-Day Headway Heatmap — Route {data.route}</span>
              <div className="flex items-center gap-3 text-[9px] text-[var(--text-muted)]">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-emerald-500 inline-block" /> ≤6m</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-yellow-400 inline-block" /> ≤10m</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-orange-400 inline-block" /> ≤15m</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-red-500 inline-block" /> &gt;15m</span>
              </div>
            </div>

            <div className="overflow-x-auto p-6">
              <table className="w-full border-separate border-spacing-0.5 min-w-max">
                <thead>
                  <tr>
                    <th className="text-[9px] atlas-label opacity-40 text-left pr-4 font-normal w-24">Day</th>
                    {HOURS.map(h => (
                      <th key={h} className="text-[9px] atlas-label opacity-40 text-center font-normal w-10">
                        {hourLabel(h)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {/* Average row */}
                  <tr>
                    <td className="text-[9px] font-black atlas-label text-indigo-400 pr-4 py-1">7-day avg</td>
                    {HOURS.map(h => {
                      const avg = hourlyAvg[h] ?? null;
                      return (
                        <td key={h} className="py-1">
                          <div
                            className={`w-9 h-5 rounded-sm ${headwayColor(avg)} opacity-80 flex items-center justify-center`}
                            title={avg !== null ? `${avg}m avg` : 'No data'}
                          >
                            {avg !== null && (
                              <span className="text-[8px] font-black text-white drop-shadow">{avg}</span>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                  <tr><td colSpan={HOURS.length + 1} className="py-1"><div className="h-px bg-[var(--border)]" /></td></tr>
                  {/* Per-day rows */}
                  {grid.days.map(day => (
                    <tr key={day}>
                      <td className="text-[10px] font-bold text-[var(--text-muted)] pr-4 py-1 whitespace-nowrap">
                        {dayLabel(day)}
                      </td>
                      {HOURS.map(h => {
                        const cell = grid.cells[day]?.[h];
                        const val = cell?.estHeadwayMins ?? null;
                        const isWorst = data.summary.worstHour === h;
                        return (
                          <td key={h} className="py-1">
                            <div
                              className={`w-9 h-6 rounded-sm ${headwayColor(val)} flex items-center justify-center transition-all hover:scale-110 cursor-default ${isWorst ? 'ring-1 ring-red-500/50' : ''}`}
                              title={val !== null ? `${val}m est. headway · ${cell?.vehicles} vehicles` : 'No data'}
                            >
                              {val !== null && (
                                <span className="text-[8px] font-black text-white drop-shadow">{val}</span>
                              )}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          </>
          )}
        </>
      )}
    </div>
  );
}
