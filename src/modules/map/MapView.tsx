import React, { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, CircleMarker, Tooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { useAuthStore } from '../../hooks/useAuthStore';

const AGENCIES = [
  { id: 'ttc',         label: 'TTC (Toronto)' },
  { id: 'mbta',        label: 'MBTA (Boston)' },
  { id: 'muni',        label: 'Muni (SF)' },
  { id: 'trimet',      label: 'TriMet (Portland)' },
  { id: 'metrotransit',label: 'Metro Transit (Minneapolis)' },
  { id: 'octranspo',   label: 'OC Transpo (Ottawa)' },
  { id: 'mtabus',      label: 'MTA Bus (NYC)' },
  { id: 'translink',   label: 'TransLink (Vancouver)' },
  { id: 'wego',        label: 'WeGo (Nashville)' },
  { id: 'mcts',        label: 'MCTS (Milwaukee)' },
  { id: 'septa',       label: 'SEPTA (Philadelphia)' },
  { id: 'edmonton',    label: 'ETS (Edmonton)' },
  { id: 'vta',         label: 'VTA (San Jose)' },
  { id: 'drt',         label: 'DRT (Durham)' },
  { id: 'actransit',   label: 'AC Transit (Oakland)' },
  { id: 'sta',         label: 'STA (Spokane)' },
  { id: 'gcrta',       label: 'GCRTA (Cleveland)' },
  { id: 'halifax',     label: 'Halifax Transit' },
];

const AGENCY_CENTERS: Record<string, [number, number]> = {
  ttc:          [43.6532, -79.3832],
  mbta:         [42.3601, -71.0589],
  muni:         [37.7749, -122.4194],
  trimet:       [45.5051, -122.6750],
  metrotransit: [44.9778, -93.2650],
  octranspo:    [45.4215, -75.6972],
  mtabus:       [40.7128, -74.0060],
  translink:    [49.2827, -123.1207],
  wego:         [36.1627, -86.7816],
  mcts:         [43.0389, -87.9065],
  septa:        [39.9526, -75.1652],
  edmonton:     [53.5461, -113.4938],
  vta:          [37.3382, -121.8863],
  drt:          [43.8971, -78.8658],
  actransit:    [37.8044, -122.2712],
  sta:          [47.6588, -117.4260],
  gcrta:        [41.4993, -81.6944],
  halifax:      [44.6488, -63.5752],
};

interface Vehicle {
  vehicle_id:  string;
  trip_id:     string;
  route_id:    string;
  lat:         number;
  lon:         number;
  speed:       number | null;
  bearing:     number | null;
  dist_from_shape?: number;
  is_detour?:      boolean;
  observed_at:     string;
}

function speedColour(speed: number | null, dimmed: boolean, isDetour?: boolean): string {
  if (isDetour) return '#d946ef'; // Magenta for detours
  const alpha = dimmed ? '55' : '';
  if (speed === null || speed === 0) return `#ef4444${alpha}`;
  if (speed < 5)                     return `#f97316${alpha}`;
  if (speed < 12)                    return `#eab308${alpha}`;
  return                                     `#22c55e${alpha}`;
}

export default function MapView() {
  const [agency, setAgency]           = useState('ttc');
  const [highlight, setHighlight]     = useState('');
  const [vehicles, setVehicles]       = useState<Vehicle[]>([]);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function fetchVehicles(ag: string) {
    setLoading(true);
    setError(null);
    try {
      const user = useAuthStore.getState().user;
      const token = user ? await user.getIdToken() : null;
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const r = await fetch(`/api/vehicles?agency=${ag}`, { headers });
      if (!r.ok) throw new Error(`${r.status}`);
      const data = await r.json();
      setVehicles(data.vehicles ?? []);
      setLastUpdated(new Date());
    } catch {
      setError('Real-time feed unavailable');
      if (intervalRef.current) clearInterval(intervalRef.current);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchVehicles(agency);
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => fetchVehicles(agency), 30000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [agency]);

  const filter = highlight.trim().toUpperCase();

  const center = AGENCY_CENTERS[agency] ?? [43.6532, -79.3832];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Controls Container */}
      <div className="flex justify-center border-b border-[var(--border)] bg-[var(--bg)]">
        <div className="max-w-7xl w-full flex items-center gap-4 px-4 md:px-8 py-4">
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">Agency</label>
          <select
            value={agency}
            onChange={e => { setAgency(e.target.value); setHighlight(''); }}
            className="text-[13px] bg-[var(--surface)] border border-[var(--border)] rounded px-3 py-1.5 text-[var(--text-primary)] focus:outline-none"
          >
            {AGENCIES.map(a => (
              <option key={a.id} value={a.id}>{a.label}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
            Route <span className="normal-case font-normal opacity-60">(optional)</span>
          </label>
          <input
            type="text"
            value={highlight}
            onChange={e => setHighlight(e.target.value)}
            placeholder="e.g. 510"
            className="text-[13px] bg-[var(--surface)] border border-[var(--border)] rounded px-3 py-1.5 text-[var(--text-primary)] focus:outline-none w-28"
          />
        </div>

        <div className="ml-auto flex items-center gap-6">

          <div className="text-[12px] text-[var(--text-muted)]">
            {loading && 'Loading…'}
            {!loading && !error && vehicles.length > 0 && (
              <span>
                {filter
                  ? `${vehicles.filter(v => v.route_id.toUpperCase() === filter).length} of ${vehicles.length} vehicles · route ${filter}`
                  : `${vehicles.length} vehicles`
                }
                {' · '}updated {lastUpdated?.toLocaleTimeString()}
              </span>
            )}
            {!loading && !error && vehicles.length === 0 && 'No active vehicles found on this feed'}
          </div>
        </div>
      </div>

      {/* Map */}
      <div className="flex-1 relative">
        {error && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] bg-[var(--bg)]/90 border border-[var(--border)] text-[var(--text-muted)] px-4 py-2 rounded-xl backdrop-blur-md text-[12px] shadow-xl flex items-center gap-3">
                {error}
                <button
                    onClick={() => { setError(null); fetchVehicles(agency); }}
                    className="text-indigo-400 hover:text-indigo-300 font-bold transition-colors"
                >
                    Retry
                </button>
            </div>
        )}
        
        {/* Floating Legend */}
        <div className="absolute bottom-6 right-6 z-[1000] bg-[var(--surface)]/90 backdrop-blur-md border border-[var(--border)] rounded-xl p-4 shadow-xl flex flex-col gap-3">
            <span className="text-[10px] uppercase font-black tracking-widest text-[var(--text-muted)] mb-1">Status Legend</span>
            {[
              { colour: '#ef4444', label: 'Stopped (0 km/h)' },
              { colour: '#f97316', label: 'Crawling (<5 km/h)' },
              { colour: '#eab308', label: 'Slow (<12 km/h)' },
              { colour: '#22c55e', label: 'Moving' },
              { colour: '#d946ef', label: 'Off-Route / Detour' },
            ].map(l => (
              <div key={l.label} className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full shadow-sm" style={{ background: l.colour }} />
                <span className="text-xs font-bold text-[var(--text-secondary)]">{l.label}</span>
              </div>
            ))}
        </div>

        <MapContainer
          key={agency}
          center={center}
          zoom={12}
          className="w-full h-full"
          style={{ background: '#0a0a0a' }}
        >
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://carto.com/">CARTO</a>'
          />
          {vehicles.map(v => {
            const dimmed = filter !== '' && v.route_id.toUpperCase() !== filter;
            return (
              <CircleMarker
                key={v.vehicle_id}
                center={[v.lat, v.lon]}
                radius={dimmed ? 4 : 8}
                pathOptions={{
                  color:       v.is_detour ? '#d946ef' : speedColour(v.speed, dimmed),
                  fillColor:   speedColour(v.speed, dimmed),
                  fillOpacity: dimmed ? 0.25 : 0.9,
                  weight:      v.is_detour ? 3 : 1.5,
                }}
              >
                {!dimmed && (
                  <Tooltip>
                    <div className="text-xs">
                      <div className="flex items-center justify-between gap-4">
                        <strong>Vehicle {v.vehicle_id}</strong>
                        {v.is_detour && (
                          <span className="px-1.5 py-0.5 rounded bg-magenta-500 text-[10px] bg-magenta-900/30 text-magenta-400 font-bold uppercase tracking-tight">Detour</span>
                        )}
                      </div>
                      <div>Route {v.route_id}</div>
                      {v.is_detour && (
                        <div className="text-magenta-400 font-medium my-0.5">
                          Off-route: {v.dist_from_shape?.toFixed(0)}m
                        </div>
                      )}
                      {v.speed !== null && <div>Speed: {(v.speed * 3.6).toFixed(1)} km/h</div>}
                      {v.bearing !== null && <div>Bearing: {v.bearing}°</div>}
                      <div className="text-gray-400">{new Date(v.observed_at).toLocaleTimeString()}</div>
                    </div>
                  </Tooltip>
                )}
              </CircleMarker>
            );
          })}
        </MapContainer>
      </div>
    </div>
  );
}
