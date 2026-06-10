import React, { useState, useEffect, useCallback } from 'react';
import { MapContainer, TileLayer, useMap, GeoJSON } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { Filter } from 'lucide-react';

const HEADWAY_TIERS = [
  { max: 10, color: '#10b981', label: '≤10m' },
  { max: 15, color: '#6366f1', label: '≤15m' },
  { max: 20, color: '#8b5cf6', label: '≤20m' },
  { max: 30, color: '#f59e0b', label: '≤30m' },
  { max: 60, color: '#f97316', label: '≤60m' },
  { max: Infinity, color: '#4b5563', label: 'Infrequent' },
];

const getTierColor = (tier: string | null): string => {
  if (!tier || tier === 'span') return '#4b5563';
  const t = parseInt(tier);
  for (const { max, color } of HEADWAY_TIERS) {
    if (t <= max) return color;
  }
  return '#4b5563';
};

interface ShapeProperties {
  routeId: string;
  directionId: number;
  tier: string | null;
  headway: number | null;
  routeShortName: string | null;
  routeLongName: string | null;
}

interface GeoJsonData {
  type: string;
  features: GeoJSON.Feature[];
}

function ChangeView({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, 12);
  }, [center[0], center[1]]);
  return null;
}

interface Props {
  url: string;
  center: [number, number];
}

export default function Interval({ url, center }: Props) {
  const [geoJsonData, setGeoJsonData] = useState<GeoJsonData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [maxHeadway, setMaxHeadway] = useState(60);

  useEffect(() => {
    setGeoJsonData(null);
    setIsLoading(true);
    fetch(url)
      .then(r => r.json())
      .then(data => setGeoJsonData(data))
      .catch(err => console.error('Failed to load shapes', err))
      .finally(() => setIsLoading(false));
  }, [url]);

  const filtered = geoJsonData
    ? {
        ...geoJsonData,
        features: geoJsonData.features.filter(f => {
          const h = (f.properties as ShapeProperties).headway;
          return h === null || h <= maxHeadway;
        }),
      }
    : null;

  const stats = geoJsonData
    ? {
        total: new Set(geoJsonData.features.map(f => (f.properties as ShapeProperties).routeId)).size,
        matching: new Set((filtered?.features ?? []).map(f => (f.properties as ShapeProperties).routeId)).size,
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
        <div style="font-size:11px;color:rgba(255,255,255,0.5)">${headway != null ? `${headway}m interval` : 'No headway data'}</div>
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
        {filtered && (
          <GeoJSON
            key={`${url}-${maxHeadway}`}
            data={filtered as GeoJSON.FeatureCollection}
            style={feature => ({
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
            <span className="text-[11px] font-bold text-white/50 uppercase tracking-widest">Loading</span>
          </div>
        </div>
      )}

      <div className="absolute top-6 left-6 z-[1000] w-72">
        <div className="bg-[#0f0f0f]/80 backdrop-blur-md border border-white/10 p-5 rounded-2xl shadow-2xl">
          <h2 className="text-xl font-black mb-1 leading-tight italic">Interval</h2>
          <p className="text-xs text-white/40 leading-relaxed mb-4">Route shapes colored by scheduled frequency.</p>

          {stats && (
            <div className="grid grid-cols-2 gap-3 mb-5">
              <div className="bg-white/5 rounded-xl p-3 border border-white/5">
                <div className="text-[9px] font-bold text-white/30 uppercase tracking-tighter mb-1">Matching</div>
                <div className="text-xl font-black text-white">
                  {stats.matching} <span className="text-[10px] text-white/40 font-bold uppercase">routes</span>
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

          <div className="space-y-3">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-white/30">
              <Filter className="w-3 h-3" />
              <span>Show up to</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {[10, 15, 20, 30, 60].map(m => (
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

          <div className="mt-5 pt-5 border-t border-white/5 space-y-2">
            <div className="text-[10px] font-bold uppercase tracking-wider text-white/30 mb-3">Legend</div>
            <div className="grid grid-cols-2 gap-1.5">
              {HEADWAY_TIERS.map(({ color, label }) => (
                <div key={label} className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
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
