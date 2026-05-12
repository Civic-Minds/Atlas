import React, { useState, useEffect, useCallback } from 'react';
import { MapContainer, TileLayer, useMap, GeoJSON } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { Filter } from 'lucide-react';
import { useAtlasStore } from '../store/atlas';

const HEADWAY_TIERS = [
  { max: 10, color: '#10b981', label: '≤10m' },
  { max: 15, color: '#6366f1', label: '≤15m' },
  { max: 20, color: '#8b5cf6', label: '≤20m' },
  { max: 30, color: '#f59e0b', label: '≤30m' },
  { max: 60, color: '#f97316', label: '≤60m' },
  { max: Infinity, color: '#4b5563', label: 'No data' },
];

const getTierColor = (tier: string | null): string => {
  if (!tier) return '#4b5563';
  const t = parseInt(tier);
  for (const { max, color } of HEADWAY_TIERS) {
    if (t <= max) return color;
  }
  return '#4b5563';
};

function ChangeView({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, 12);
  }, [center[0], center[1]]);
  return null;
}

interface ShapeProperties {
  routeId: string;
  directionId: number;
  tier: string | null;
  headway: number | null;
  routeShortName: string | null;
  routeLongName: string | null;
}

export default function Interval() {
  const { selectedAgency, center } = useAtlasStore();
  const [geoJsonData, setGeoJsonData] = useState<GeoJSON.FeatureCollection | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [maxHeadway, setMaxHeadway] = useState(60);

  useEffect(() => {
    setGeoJsonData(null);
    setIsLoading(true);
    fetch(`/api/shapes/${selectedAgency}`)
      .then((res) => res.json())
      .then((data) => setGeoJsonData(data))
      .catch((err) => console.error('Failed to fetch shapes', err))
      .finally(() => setIsLoading(false));
  }, [selectedAgency]);

  const filteredGeoJson: GeoJSON.FeatureCollection | null = geoJsonData
    ? {
        ...geoJsonData,
        features: geoJsonData.features.filter((f) => {
          const headway = (f.properties as ShapeProperties).headway;
          return headway === null || headway <= maxHeadway;
        }),
      }
    : null;

  const stats = geoJsonData
    ? {
        total: new Set(geoJsonData.features.map((f) => (f.properties as ShapeProperties).routeId)).size,
        matching: new Set(
          (filteredGeoJson?.features ?? []).map((f) => (f.properties as ShapeProperties).routeId)
        ).size,
      }
    : null;

  const onEachFeature = useCallback((feature: GeoJSON.Feature, layer: L.Layer) => {
    const { routeId, headway, routeShortName, routeLongName } = feature.properties as ShapeProperties;
    const name = routeShortName || routeId;
    const fullName = routeLongName || `Route ${routeId}`;
    (layer as L.Path).bindTooltip(
      `<div style="font-family:ui-monospace,monospace;padding:8px 12px;background:#0f0f0f;border:1px solid rgba(255,255,255,0.1);border-radius:8px;pointer-events:none">
        <div style="font-size:10px;font-weight:900;color:#818cf8;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:4px">${name}</div>
        <div style="font-size:12px;font-weight:700;color:#fff;margin-bottom:2px">${fullName}</div>
        <div style="font-size:11px;color:rgba(255,255,255,0.5)">${headway != null ? `${Math.round(headway)}m interval` : 'No headway data'}</div>
      </div>`,
      { sticky: true, className: 'atlas-tooltip', opacity: 1 }
    );
  }, []);

  return (
    <div className="relative w-full h-full">
      <MapContainer
        center={center}
        zoom={12}
        style={{ height: '100%', width: '100%', background: '#0a0a0a' }}
        zoomControl={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />
        {filteredGeoJson && (
          <GeoJSON
            key={`${selectedAgency}-${maxHeadway}`}
            data={filteredGeoJson}
            style={(feature) => ({
              color: getTierColor(feature?.properties?.tier),
              weight: feature?.properties?.tier && parseInt(feature.properties.tier) <= 15 ? 3 : 1.5,
              opacity: feature?.properties?.tier ? 0.8 : 0.3,
            })}
            onEachFeature={onEachFeature}
          />
        )}
        <ChangeView center={center} />
      </MapContainer>

      {isLoading && (
        <div className="absolute inset-0 z-[2000] flex items-center justify-center bg-[#0a0a0a]/70 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-[11px] font-bold text-white/50 uppercase tracking-widest">Loading shapes</span>
          </div>
        </div>
      )}

      <div className="absolute top-6 left-6 z-[1000] w-80">
        <div className="bg-[#0f0f0f]/80 backdrop-blur-md border border-white/10 p-6 rounded-2xl shadow-2xl">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[10px] font-bold tracking-widest text-indigo-400 uppercase">Mini-App 01</span>
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          </div>
          <h2 className="text-xl font-black mb-1 leading-tight italic">Interval</h2>
          <p className="text-xs text-white/50 leading-relaxed">
            The physical frequency layer. Filtering by scheduled promise.
          </p>

          {stats && (
            <div className="mt-4 grid grid-cols-2 gap-4">
              <div className="bg-white/5 rounded-xl p-3 border border-white/5">
                <div className="text-[9px] font-bold text-white/30 uppercase tracking-tighter mb-1">Target Met</div>
                <div className="text-xl font-black text-white">
                  {stats.matching}{' '}
                  <span className="text-[10px] text-white/40 font-bold uppercase tracking-tighter">Routes</span>
                </div>
              </div>
              <div className="bg-white/5 rounded-xl p-3 border border-white/5">
                <div className="text-[9px] font-bold text-white/30 uppercase tracking-tighter mb-1">Coverage</div>
                <div className="text-xl font-black text-indigo-400">
                  {stats.total > 0 ? Math.round((stats.matching / stats.total) * 100) : 0}%
                </div>
              </div>
            </div>
          )}

          <div className="mt-6 pt-6 border-t border-white/5 space-y-4">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-white/30">
              <Filter className="w-3 h-3" />
              <span>Show routes up to</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {[10, 15, 20, 30, 60].map((m) => (
                <button
                  key={m}
                  onClick={() => setMaxHeadway(m)}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-black transition-all border ${
                    maxHeadway === m
                      ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-500/20'
                      : 'bg-white/5 border-white/5 text-white/40 hover:bg-white/10 hover:text-white/60'
                  }`}
                >
                  {m}m
                </button>
              ))}
            </div>
          </div>

          <div className="mt-6 pt-6 border-t border-white/5 space-y-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-white/30">Visual Legend</div>
            <div className="grid grid-cols-2 gap-2">
              {HEADWAY_TIERS.map(({ color, label }) => (
                <div key={label} className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ background: color }} />
                  <span className="text-[10px] text-white/70 font-bold tracking-tight">{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
