import React, { useEffect, useRef, useState } from 'react';
import { CircleMarker, MapContainer, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { useAuthStore } from '../../hooks/useAuthStore';
import { useViewAs } from '../../hooks/useViewAs';

const AGENCY_CENTERS: Record<string, [number, number]> = {
  ttc: [43.6532, -79.3832],
  mbta: [42.3601, -71.0589],
  muni: [37.7749, -122.4194],
  trimet: [45.5051, -122.675],
  metrotransit: [44.9778, -93.265],
  octranspo: [45.4215, -75.6972],
  mtabus: [40.7128, -74.006],
  translink: [49.2827, -123.1207],
  wego: [36.1627, -86.7816],
  mcts: [43.0389, -87.9065],
  septa: [39.9526, -75.1652],
  edmonton: [53.5461, -113.4938],
  vta: [37.3382, -121.8863],
  drt: [43.8971, -78.8658],
  actransit: [37.8044, -122.2712],
  sta: [47.6588, -117.426],
  gcrta: [41.4993, -81.6944],
  halifax: [44.6488, -63.5752],
};

const AGENCY_LABELS: Record<string, string> = {
  ttc: 'Toronto Transit Commission',
  mbta: 'Massachusetts Bay Transportation Authority',
  muni: 'SF Muni',
  trimet: 'TriMet',
  metrotransit: 'Metro Transit',
  octranspo: 'OC Transpo',
  mtabus: 'MTA New York City Bus',
  translink: 'TransLink',
  wego: 'WeGo Public Transit',
  mcts: 'Milwaukee County Transit System',
  septa: 'SEPTA',
  edmonton: 'Edmonton Transit System',
  vta: 'VTA',
  drt: 'Durham Region Transit',
  actransit: 'AC Transit',
  sta: 'Spokane Transit Authority',
  gcrta: 'Greater Cleveland RTA',
  halifax: 'Halifax Transit',
};

interface Vehicle {
  vehicle_id: string;
  trip_id: string;
  route_id: string;
  lat: number;
  lon: number;
  speed: number | null;
  bearing: number | null;
  dist_from_shape?: number;
  is_detour?: boolean;
  observed_at: string;
}

function MapStateTracker({ onZoomChange }: { onZoomChange: (z: number) => void }) {
  const map = useMapEvents({
    zoomend: () => {
      onZoomChange(map.getZoom());
    },
  });
  return null;
}

function FitVehicles({
  agency,
  vehicles,
  onZoomChange,
}: {
  agency: string;
  vehicles: Vehicle[];
  onZoomChange?: (z: number) => void;
}) {
  const map = useMap();
  const lastAgencyRef = useRef<string | null>(null);

  useEffect(() => {
    if (vehicles.length === 0) return;

    const shouldFit = lastAgencyRef.current !== agency;
    if (!shouldFit) return;

    const bounds = vehicles.reduce(
      (acc, v) => ({
        minLat: Math.min(acc.minLat, v.lat),
        maxLat: Math.max(acc.maxLat, v.lat),
        minLon: Math.min(acc.minLon, v.lon),
        maxLon: Math.max(acc.maxLon, v.lon),
      }),
      { minLat: 90, maxLat: -90, minLon: 180, maxLon: -180 }
    );

    map.fitBounds(
      [
        [bounds.minLat, bounds.minLon],
        [bounds.maxLat, bounds.maxLon],
      ],
      { padding: [72, 72] }
    );
    if (onZoomChange) onZoomChange(map.getZoom());
    lastAgencyRef.current = agency;
  }, [agency, map, onZoomChange, vehicles]);

  return null;
}

function speedColour(speed: number | null, dimmed: boolean, isDetour?: boolean): string {
  if (isDetour) return dimmed ? '#d946ef80' : '#d946ef';
  if (speed === null || speed === 0) return dimmed ? '#ef444480' : '#ef4444';
  if (speed < 5) return dimmed ? '#f9731680' : '#f97316';
  if (speed < 12) return dimmed ? '#eab30880' : '#eab308';
  return dimmed ? '#22c55e80' : '#22c55e';
}

function speedLabel(speed: number | null): string {
  if (speed === null || speed === 0) return 'Stopped';
  if (speed < 5) return 'Crawling';
  if (speed < 12) return 'Slow';
  return 'Moving';
}

function formatObservedAt(observedAt: string): string {
  return new Date(observedAt).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  });
}

export default function MapView() {
  const { role, agencyId: userAgencyId } = useAuthStore();
  const { viewAsAgency } = useViewAs();
  const isAdmin = role === 'admin' || role === 'researcher';
  const [agency, setAgency] = useState(isAdmin ? viewAsAgency?.slug ?? 'sta' : userAgencyId ?? 'sta');
  const [highlight, setHighlight] = useState('');
  const [zoom, setZoom] = useState(12);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (isAdmin) setAgency(viewAsAgency?.slug ?? 'sta');
  }, [viewAsAgency, isAdmin]);

  async function fetchVehicles(ag: string) {
    setLoading(true);
    setError(null);
    try {
      const user = useAuthStore.getState().user;
      const token = user ? await user.getIdToken() : null;
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      const response = await fetch(`/api/vehicles?agency=${ag}`, { headers });
      if (!response.ok) throw new Error(`${response.status}`);
      const data = await response.json();
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
    void fetchVehicles(agency);
    setSelectedVehicleId(null);
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => void fetchVehicles(agency), 30000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [agency]);

  useEffect(() => {
    if (selectedVehicleId && !vehicles.some(v => v.vehicle_id === selectedVehicleId)) {
      setSelectedVehicleId(null);
    }
  }, [selectedVehicleId, vehicles]);

  const filter = highlight.trim().toUpperCase();
  const filteredVehicles = filter === '' ? vehicles : vehicles.filter(v => v.route_id.toUpperCase() === filter);
  const movingCount = filteredVehicles.filter(v => v.speed !== null && v.speed >= 12 && !v.is_detour).length;
  const stoppedCount = filteredVehicles.filter(v => v.speed === null || v.speed === 0).length;
  const detourCount = filteredVehicles.filter(v => v.is_detour).length;
  const routeActivity = [...filteredVehicles.reduce((acc, vehicle) => {
    const key = vehicle.route_id || 'Unknown';
    acc.set(key, (acc.get(key) ?? 0) + 1);
    return acc;
  }, new Map<string, number>()).entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const coverageLabel = filter ? `${filteredVehicles.length} on route ${filter}` : `${vehicles.length} active system-wide`;
  const selectedVehicle =
    filteredVehicles.find(v => v.vehicle_id === selectedVehicleId) ??
    filteredVehicles[0] ??
    null;
  const center = AGENCY_CENTERS[agency] ?? [43.6532, -79.3832];
  const agencyLabel = viewAsAgency?.slug === agency ? viewAsAgency.display_name : AGENCY_LABELS[agency] ?? agency.toUpperCase();

  return (
    <div className="relative h-[calc(100vh-64px)] overflow-hidden bg-[#eef3fb]">
      <div className="pointer-events-none absolute inset-0 z-[1] bg-[radial-gradient(circle_at_top,rgba(37,99,235,0.14),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.08)_0%,rgba(238,243,251,0.42)_100%)]" />

      <div className="absolute inset-0 z-0">
        <MapContainer
          key={agency}
          center={center}
          zoom={12}
          className="absolute inset-0"
          style={{ background: '#eef3fb' }}
          zoomControl={false}
        >
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
            attribution="&copy; CARTO"
          />
          <MapStateTracker onZoomChange={setZoom} />
          <FitVehicles agency={agency} vehicles={vehicles} onZoomChange={setZoom} />
          {vehicles.map(v => {
            const routeMatch = filter === '' || v.route_id.toUpperCase() === filter;
            const isSelected = selectedVehicle?.vehicle_id === v.vehicle_id;
            const dimmed = !routeMatch;
            const baseRadius = Math.max(4, Math.min(11, zoom - 6));
            const radius = isSelected ? baseRadius + 3 : dimmed ? baseRadius * 0.65 : baseRadius;
            const color = speedColour(v.speed, dimmed, v.is_detour);

            return (
              <CircleMarker
                key={`${v.vehicle_id}-${v.observed_at}`}
                center={[v.lat, v.lon]}
                radius={radius}
                eventHandlers={{
                  click: () => setSelectedVehicleId(v.vehicle_id),
                }}
                pathOptions={{
                  color,
                  fillColor: color,
                  fillOpacity: dimmed ? 0.24 : isSelected ? 1 : 0.92,
                  opacity: isSelected ? 1 : 0.9,
                  weight: isSelected ? 3 : v.is_detour ? 2.5 : 1.5,
                }}
              >
                {routeMatch && (
                  <Tooltip>
                    <div className="min-w-[180px] text-xs">
                      <div className="mb-1 flex items-center justify-between gap-3">
                        <strong>Vehicle {v.vehicle_id}</strong>
                        <span className="rounded-full border border-white/10 bg-black/40 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-white/70">
                          {speedLabel(v.speed)}
                        </span>
                      </div>
                      <div>Route {v.route_id || 'Unknown'}</div>
                      {v.speed !== null && <div>Speed {(v.speed * 3.6).toFixed(1)} km/h</div>}
                      {v.is_detour && (
                        <div className="font-medium text-fuchsia-400">
                          Detour {v.dist_from_shape ? `(${v.dist_from_shape.toFixed(0)}m off-shape)` : ''}
                        </div>
                      )}
                      <div className="text-white/45">{formatObservedAt(v.observed_at)}</div>
                    </div>
                  </Tooltip>
                )}
              </CircleMarker>
            );
          })}
        </MapContainer>
      </div>

      <div className="absolute left-5 top-5 z-10 flex w-[min(430px,calc(100%-2.5rem))] flex-col gap-4">
        <div className="overflow-hidden rounded-[28px] border border-slate-200/80 bg-white/88 p-5 shadow-[0_24px_80px_rgba(15,23,42,0.16)] backdrop-blur-2xl">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <div className="mb-2 flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${error ? 'bg-red-500' : loading ? 'bg-amber-400' : 'bg-emerald-400'} ${!error ? 'animate-pulse' : ''}`} />
                <span className="atlas-label text-slate-500">Live Operations</span>
              </div>
              <h2 className="text-[22px] font-black tracking-[-0.04em] text-slate-950">{agencyLabel}</h2>
              <p className="mt-1 text-[12px] leading-5 text-slate-600">
                {error ? 'Feed degraded. Last successful sync preserved on map.' : 'Cloud-backed realtime vehicle ingestion. Local machines do not power this view.'}
              </p>
            </div>
          </div>

          <div className="mb-3 rounded-2xl border border-slate-200 bg-slate-50/90 px-4 py-3">
            <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
              {error ? 'Connection' : 'Network Read'}
            </div>
            <div className="mt-1 text-sm font-bold text-slate-800">
              {error
                ? 'Map could not reach /api/vehicles.'
                : loading
                  ? 'Refreshing vehicle positions from the backend.'
                  : lastUpdated
                    ? `${filteredVehicles.length} vehicles in the current view.`
                    : 'Waiting for the first vehicle snapshot.'}
            </div>
            <div className="mt-1 text-[12px] text-slate-600">
              {error
                ? 'Check auth, local port 3001, or the SSH tunnel to OCI.'
                : filter
                  ? `Route ${filter} filter is active.`
                  : 'Showing the full visible fleet for this agency.'}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              { label: 'Visible', value: filteredVehicles.length, tone: 'text-white' },
              { label: 'Moving', value: movingCount, tone: 'text-emerald-300' },
              { label: 'Stopped', value: stoppedCount, tone: 'text-red-300' },
              { label: 'Detours', value: detourCount, tone: 'text-fuchsia-300' },
            ].map(stat => (
              <div key={stat.label} className="rounded-2xl border border-slate-200 bg-slate-50/90 px-4 py-3">
                <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">{stat.label}</div>
                <div className={`mt-1 text-2xl font-black tracking-[-0.04em] ${stat.tone}`}>{stat.value}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-[1.2fr_0.8fr] gap-3">
          <div className="rounded-[24px] border border-white/10 bg-black/60 p-4 backdrop-blur-xl">
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="atlas-label text-white/45">Route Focus</span>
              <span className="text-[11px] font-bold text-white/45">{coverageLabel}</span>
            </div>
            <input
              type="text"
              value={highlight}
              onChange={e => setHighlight(e.target.value)}
              placeholder="All routes"
              className="w-full rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm font-bold tracking-wide text-cyan-200 outline-none placeholder:text-white/25 focus:border-cyan-400/40 focus:bg-white/[0.08]"
            />
          </div>

          <div className="rounded-[24px] border border-white/10 bg-black/60 p-4 backdrop-blur-xl">
            <div className="atlas-label mb-2 text-white/45">Controls</div>
            <div className="flex gap-2">
              <button
                onClick={() => void fetchVehicles(agency)}
                className="flex-1 rounded-2xl border border-white/10 bg-white/[0.06] px-3 py-3 text-[11px] font-black uppercase tracking-[0.16em] text-white/80 transition hover:bg-white/[0.1]"
              >
                Refresh
              </button>
              <button
                onClick={() => {
                  setHighlight('');
                  setSelectedVehicleId(null);
                }}
                className="flex-1 rounded-2xl border border-white/10 bg-white/[0.06] px-3 py-3 text-[11px] font-black uppercase tracking-[0.16em] text-white/80 transition hover:bg-white/[0.1]"
              >
                Reset
              </button>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="absolute left-1/2 top-6 z-20 -translate-x-1/2 rounded-2xl border border-red-500/40 bg-red-500/15 px-4 py-2 text-[12px] font-medium text-red-100 shadow-xl backdrop-blur-xl">
          {error}
        </div>
      )}

      <div className="absolute bottom-6 left-5 z-10 w-[min(340px,calc(100%-2.5rem))] rounded-[28px] border border-white/10 bg-black/60 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-2xl">
        <div className="mb-3 flex items-center justify-between gap-3">
          <span className="atlas-label text-white/45">Vehicle Inspector</span>
          {selectedVehicle && (
            <span className="rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-white/55">
              {selectedVehicle.vehicle_id}
            </span>
          )}
        </div>

        {selectedVehicle ? (
          <div className="space-y-4">
            <div>
              <div className="flex items-center gap-2">
                <div
                  className="h-3 w-3 rounded-full shadow-[0_0_18px_currentColor]"
                  style={{ color: speedColour(selectedVehicle.speed, false, selectedVehicle.is_detour), backgroundColor: speedColour(selectedVehicle.speed, false, selectedVehicle.is_detour) }}
                />
                <h3 className="text-xl font-black tracking-[-0.04em] text-white">Route {selectedVehicle.route_id || 'Unknown'}</h3>
              </div>
              <p className="mt-1 text-sm text-white/55">{speedLabel(selectedVehicle.speed)} {selectedVehicle.is_detour ? 'with detour flag' : 'in current feed snapshot'}</p>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-2xl border border-white/8 bg-white/[0.04] p-3">
                <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/38">Speed</div>
                <div className="mt-1 font-black text-white">
                  {selectedVehicle.speed !== null ? `${(selectedVehicle.speed * 3.6).toFixed(1)} km/h` : 'Unknown'}
                </div>
              </div>
              <div className="rounded-2xl border border-white/8 bg-white/[0.04] p-3">
                <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/38">Last Seen</div>
                <div className="mt-1 font-black text-white">{formatObservedAt(selectedVehicle.observed_at)}</div>
              </div>
              <div className="rounded-2xl border border-white/8 bg-white/[0.04] p-3">
                <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/38">Trip</div>
                <div className="mt-1 truncate font-black text-white">{selectedVehicle.trip_id || 'Unavailable'}</div>
              </div>
              <div className="rounded-2xl border border-white/8 bg-white/[0.04] p-3">
                <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/38">Bearing</div>
                <div className="mt-1 font-black text-white">{selectedVehicle.bearing !== null ? `${selectedVehicle.bearing}\u00b0` : 'Unknown'}</div>
              </div>
            </div>

            {selectedVehicle.is_detour && (
              <div className="rounded-2xl border border-fuchsia-400/25 bg-fuchsia-400/10 px-4 py-3 text-sm text-fuchsia-100">
                Off-route signal {selectedVehicle.dist_from_shape ? `at ${selectedVehicle.dist_from_shape.toFixed(0)}m from the scheduled shape.` : 'reported by matcher.'}
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-white/12 bg-white/[0.03] px-4 py-6 text-sm text-white/45">
            Select a vehicle marker to inspect trip, speed, bearing, and detour status.
          </div>
        )}
      </div>

      <div className="absolute bottom-6 right-5 z-10 flex w-[220px] flex-col gap-4">
        <div className="rounded-[24px] border border-white/10 bg-black/60 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-2xl">
          <div className="atlas-label mb-3 text-white/45">Route Activity</div>
          <div className="space-y-2.5">
            {routeActivity.length > 0 ? routeActivity.map(([routeId, count]) => (
              <div key={routeId} className="flex items-center justify-between gap-3">
                <span className="text-[12px] font-bold text-white/78">{routeId}</span>
                <span className="rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-white/55">
                  {count} live
                </span>
              </div>
            )) : (
              <div className="text-[12px] text-white/45">No vehicles in current filter.</div>
            )}
          </div>
        </div>

        <div className="rounded-[24px] border border-white/10 bg-black/60 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-2xl">
          <div className="atlas-label mb-3 text-white/45">Status Key</div>
          <div className="space-y-2.5">
          {[
            { color: '#ef4444', label: 'Stopped' },
            { color: '#f97316', label: 'Crawling' },
            { color: '#eab308', label: 'Slow' },
            { color: '#22c55e', label: 'Moving' },
            { color: '#d946ef', label: 'Detour' },
          ].map(item => (
              <div key={item.label} className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span
                    className="h-2.5 w-2.5 rounded-full shadow-[0_0_18px_currentColor]"
                    style={{ color: item.color, backgroundColor: item.color }}
                  />
                  <span className="text-[12px] font-bold text-white/75">{item.label}</span>
                </div>
                <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/28">
                  {item.label === 'Detour' ? 'shape' : 'speed'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
