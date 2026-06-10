import React, { useState, useEffect, useCallback, useRef } from 'react';
import { MapContainer, TileLayer, GeoJSON, useMapEvents } from 'react-leaflet';
import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Filter, Search, Sun, Moon, X } from 'lucide-react';
import type { Agency } from '../App';

const HEADWAY_TIERS = [
  { max: 10, color: '#10b981', label: '≤10m' },
  { max: 15, color: '#6366f1', label: '≤15m' },
  { max: 20, color: '#8b5cf6', label: '≤20m' },
  { max: 30, color: '#f59e0b', label: '≤30m' },
  { max: 60, color: '#f97316', label: '≤60m' },
  { max: Infinity, color: '#4b5563', label: 'Infrequent' },
];

// Centroid of the GTHA network
const REGION_CENTER: [number, number] = [43.65, -79.45];
const REGION_ZOOM = 10;

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
  agencyName?: string;
}

interface Props {
  agencies: Agency[];
}

function MapClickHandler({ onClear }: { onClear: () => void }) {
  useMapEvents({ click: onClear });
  return null;
}

export default function Interval({ agencies }: Props) {
  const [layers, setLayers] = useState<Record<string, GeoJSON.FeatureCollection>>({});
  const [loadedCount, setLoadedCount] = useState(0);
  const [maxHeadway, setMaxHeadway] = useState(60);
  const [query, setQuery] = useState('');
  const [selectedRoute, setSelectedRoute] = useState<string | null>(null);
  const [lightMode, setLightMode] = useState(false);
  const geoJsonRefs = useRef<Record<string, L.GeoJSON | null>>({});

  const theme = lightMode ? {
    mapBg: '#f0f0f0',
    tileUrl: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    panel: 'bg-white/90 backdrop-blur-md border border-black/10',
    text: 'text-gray-900',
    textMuted: 'text-gray-400',
    textDim: 'text-gray-400',
    textLegend: 'text-gray-600',
    inputCls: 'bg-black/5 border border-black/10 text-gray-900 placeholder-gray-400 focus:border-indigo-500',
    statBg: 'bg-black/5 border border-black/5',
    statLabel: 'text-gray-400',
    statValue: 'text-gray-900',
    statValueMuted: 'text-gray-400',
    divider: 'border-black/10',
    btnInactive: 'bg-black/5 border-black/5 text-gray-500 hover:bg-black/10 hover:text-gray-700',
    clearBtn: 'text-gray-400 hover:text-gray-600',
    loadingBg: 'bg-white/90 backdrop-blur-md border border-black/10',
    loadingText: 'text-gray-500',
    dimRoute: '#cbd5e1',
    searchIcon: 'text-gray-400',
    filterLabel: 'text-gray-400',
  } : {
    mapBg: '#0a0a0a',
    tileUrl: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    panel: 'bg-[#0f0f0f]/80 backdrop-blur-md border border-white/10',
    text: 'text-white',
    textMuted: 'text-white/40',
    textDim: 'text-white/30',
    textLegend: 'text-white/70',
    inputCls: 'bg-white/5 border border-white/10 text-white placeholder-white/25 focus:border-indigo-500',
    statBg: 'bg-white/5 border border-white/5',
    statLabel: 'text-white/30',
    statValue: 'text-white',
    statValueMuted: 'text-white/40',
    divider: 'border-white/5',
    btnInactive: 'bg-white/5 border-white/5 text-white/40 hover:bg-white/10 hover:text-white/60',
    clearBtn: 'text-white/30 hover:text-white/70',
    loadingBg: 'bg-[#0f0f0f]/80 backdrop-blur-md border border-white/10',
    loadingText: 'text-white/50',
    dimRoute: '#334155',
    searchIcon: 'text-white/30',
    filterLabel: 'text-white/30',
  };

  useEffect(() => {
    let cancelled = false;
    setLayers({});
    setLoadedCount(0);

    for (const agency of agencies) {
      fetch(agency.url)
        .then(r => r.json())
        .then((data: GeoJSON.FeatureCollection) => {
          if (cancelled) return;
          for (const f of data.features) {
            (f.properties as ShapeProperties).agencyName = agency.name;
          }
          setLayers(prev => ({ ...prev, [agency.slug]: data }));
          setLoadedCount(n => n + 1);
        })
        .catch(err => {
          console.error(`Failed to load ${agency.slug}`, err);
          if (!cancelled) setLoadedCount(n => n + 1);
        });
    }
    return () => {
      cancelled = true;
    };
  }, [agencies]);

  const q = query.trim().toLowerCase();
  const matchesQuery = (p: ShapeProperties) =>
    q === '' ||
    (p.routeShortName ?? '').toLowerCase().includes(q) ||
    (p.routeLongName ?? '').toLowerCase().includes(q) ||
    p.routeId.toLowerCase().includes(q);

  const allFeatures = Object.values(layers).flatMap(fc => fc.features);
  const visibleFeatures = allFeatures.filter(f => {
    const h = (f.properties as ShapeProperties).headway;
    if (h === null) return maxHeadway === Infinity;
    return h <= maxHeadway;
  });

  const routeKey = (p: ShapeProperties) => `${p.agencyName}::${p.routeId}`;
  const stats = allFeatures.length > 0
    ? {
        total: new Set(allFeatures.map(f => routeKey(f.properties as ShapeProperties))).size,
        matching: new Set(visibleFeatures.map(f => routeKey(f.properties as ShapeProperties))).size,
      }
    : null;

  const searchMatches = q !== ''
    ? new Set(
        visibleFeatures
          .filter(f => matchesQuery(f.properties as ShapeProperties))
          .map(f => routeKey(f.properties as ShapeProperties))
      ).size
    : null;

  const styleFeature = useCallback(
    (feature?: GeoJSON.Feature) => {
      const p = feature?.properties as ShapeProperties;
      const h = p?.headway;
      if (selectedRoute !== null) {
        const key = p ? routeKey(p) : null;
        if (key === selectedRoute) {
          return { color: getTierColor(p?.tier ?? null), weight: 4, opacity: 1 };
        }
        return { color: '#1e293b', weight: 0.5, opacity: 0.2 };
      }
      const match = matchesQuery(p);
      if (!match) {
        return { color: theme.dimRoute, weight: 0.75, opacity: 0.12 };
      }
      return {
        color: getTierColor(p?.tier ?? null),
        weight: q !== '' ? 3 : p?.tier && parseInt(p.tier) <= 15 ? 2 : 1,
        opacity: p?.tier ? (q !== '' ? 1 : 0.8) : 0.3,
      };
    },
    [maxHeadway, q, selectedRoute, lightMode]
  );

  useEffect(() => {
    for (const ref of Object.values(geoJsonRefs.current)) {
      ref?.setStyle(styleFeature as (feature?: GeoJSON.Feature) => L.PathOptions);
    }
  }, [styleFeature]);

  const onEachFeature = useCallback((feature: GeoJSON.Feature, layer: L.Layer) => {
    const { routeId, headway, routeShortName, routeLongName, agencyName } =
      feature.properties as ShapeProperties;
    const name = routeShortName || routeId;
    const fullName = routeLongName || `Route ${routeId}`;
    const key = routeKey(feature.properties as ShapeProperties);
    (layer as L.Path).bindTooltip(
      `<div style="font-family:ui-monospace,monospace;padding:8px 12px;background:#0f0f0f;border:1px solid rgba(255,255,255,0.1);border-radius:8px;pointer-events:none">
        <div style="font-size:10px;font-weight:900;color:#818cf8;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:4px">${name}</div>
        <div style="font-size:12px;font-weight:700;color:#fff;margin-bottom:2px">${fullName}</div>
        <div style="font-size:11px;color:rgba(255,255,255,0.5)">${headway != null ? `${headway}m interval` : 'No headway data'}</div>
        ${agencyName ? `<div style="font-size:10px;color:rgba(255,255,255,0.35);margin-top:3px">${agencyName}</div>` : ''}
      </div>`,
      { sticky: true, className: 'atlas-tooltip', opacity: 1 }
    );
    (layer as L.Path).on('click', (e: L.LeafletMouseEvent) => {
      L.DomEvent.stopPropagation(e);
      setSelectedRoute(prev => prev === key ? null : key);
    });
  }, []);

  const isLoading = loadedCount < agencies.length;

  return (
    <div className="relative w-full h-full">
      <MapContainer
        center={REGION_CENTER}
        zoom={REGION_ZOOM}
        style={{ height: '100%', width: '100%', background: theme.mapBg }}
        zoomControl={false}
        preferCanvas={true}
      >
        <TileLayer
          key={theme.tileUrl}
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url={theme.tileUrl}
        />
        <MapClickHandler onClear={() => setSelectedRoute(null)} />
        {Object.entries(layers).map(([slug, data]) => {
          const filtered: GeoJSON.FeatureCollection = {
            ...data,
            features: data.features.filter(f => {
              const h = (f.properties as ShapeProperties).headway;
              if (h === null || h === undefined) return maxHeadway === Infinity;
              return h <= maxHeadway;
            }),
          };
          return (
            <GeoJSON
              key={`${slug}-${maxHeadway}-${q}`}
              data={filtered}
              style={styleFeature}
              onEachFeature={onEachFeature}
              ref={(r) => { geoJsonRefs.current[slug] = r; }}
            />
          );
        })}
      </MapContainer>

      {isLoading && (
        <div className={`absolute top-6 right-6 z-[1000] flex items-center gap-2 ${theme.loadingBg} px-4 py-2 rounded-xl`}>
          <div className="w-3.5 h-3.5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <span className={`text-[10px] font-bold ${theme.loadingText} uppercase tracking-widest`}>
            {loadedCount}/{agencies.length} networks
          </span>
        </div>
      )}

      <div className="absolute top-6 left-6 z-[1000] w-72">
        <div className={`${theme.panel} p-5 rounded-2xl shadow-2xl`}>
          <div className="flex items-start justify-between mb-1">
            <h2 className={`text-xl font-black leading-tight italic ${theme.text}`}>Interval</h2>
            <button
              onClick={() => setLightMode(v => !v)}
              className={`${theme.clearBtn} transition-colors mt-0.5`}
              aria-label="Toggle light mode"
            >
              {lightMode ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
            </button>
          </div>
          <p className={`text-xs ${theme.textMuted} leading-relaxed mb-4`}>
            Scheduled frequency across the GTHA.
          </p>

          <div className="relative mb-4">
            <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 ${theme.searchIcon} pointer-events-none`} />
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search routes — e.g. 504 or King"
              className={`w-full ${theme.inputCls} rounded-lg pl-9 pr-8 py-2 text-xs font-bold focus:outline-none`}
            />
            {query !== '' && (
              <button
                onClick={() => setQuery('')}
                className={`absolute right-2 top-1/2 -translate-y-1/2 ${theme.clearBtn}`}
                aria-label="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
            {searchMatches !== null && (
              <div className="mt-1.5 text-[10px] font-bold text-indigo-400 uppercase tracking-wider">
                {searchMatches} route{searchMatches === 1 ? '' : 's'} match
              </div>
            )}
          </div>

          {stats && (
            <div className="grid grid-cols-2 gap-3 mb-5">
              <div className={`${theme.statBg} rounded-xl p-3`}>
                <div className={`text-[9px] font-bold ${theme.statLabel} uppercase tracking-tighter mb-1`}>Matching</div>
                <div className={`text-xl font-black ${theme.statValue}`}>
                  {stats.matching} <span className={`text-[10px] ${theme.statValueMuted} font-bold uppercase`}>routes</span>
                </div>
              </div>
              <div className={`${theme.statBg} rounded-xl p-3`}>
                <div className={`text-[9px] font-bold ${theme.statLabel} uppercase tracking-tighter mb-1`}>Coverage</div>
                <div className="text-xl font-black text-indigo-400">
                  {stats.total > 0 ? Math.round((stats.matching / stats.total) * 100) : 0}%
                </div>
              </div>
            </div>
          )}

          <div className="space-y-3">
            <div className={`flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider ${theme.filterLabel}`}>
              <Filter className="w-3 h-3" />
              <span>Show up to</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {[10, 15, 20, 30, 60, Infinity].map(m => (
                <button
                  key={m}
                  onClick={() => setMaxHeadway(m)}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-black transition-all border ${
                    maxHeadway === m
                      ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-500/20'
                      : theme.btnInactive
                  }`}
                >
                  {m === Infinity ? 'All' : `${m}m`}
                </button>
              ))}
            </div>
          </div>

          <div className={`mt-5 pt-5 border-t ${theme.divider} space-y-2`}>
            <div className={`text-[10px] font-bold uppercase tracking-wider ${theme.textDim} mb-3`}>Legend</div>
            <div className="grid grid-cols-2 gap-1.5">
              {HEADWAY_TIERS.map(({ color, label }) => (
                <div key={label} className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                  <span className={`text-[10px] ${theme.textLegend} font-bold tracking-tight`}>{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
