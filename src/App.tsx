import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { Map as MapIcon, ChevronRight } from 'lucide-react';

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

function ChangeView({ center }: { center: [number, number] }) {
  const map = useMap();
  map.setView(center, 12);
  return null;
}

interface Agency {
  slug: string;
  display_name: string;
}

export default function App() {
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [selectedAgency, setSelectedAgency] = useState('sta');
  const [center, setCenter] = useState<[number, number]>(AGENCY_CENTERS['sta']);

  useEffect(() => {
    fetch('http://localhost:3001/api/agencies')
      .then(res => res.json())
      .then(data => setAgencies(data))
      .catch(err => console.error('Failed to fetch agencies', err));
  }, []);

  const handleAgencyChange = (slug: string) => {
    setSelectedAgency(slug);
    if (AGENCY_CENTERS[slug]) {
      setCenter(AGENCY_CENTERS[slug]);
    }
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-[#0a0a0a] text-white font-sans overflow-hidden">
      {/* Minimal Header */}
      <header className="h-16 border-b border-white/10 flex items-center justify-between px-6 shrink-0 bg-[#0f0f0f]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
            <MapIcon className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-lg font-black tracking-tighter uppercase">Atlas <span className="text-indigo-500">Reboot</span></h1>
        </div>

        <div className="flex items-center gap-4">
          <select 
            value={selectedAgency}
            onChange={(e) => handleAgencyChange(e.target.value)}
            className="bg-[#1a1a1a] border border-white/10 rounded-lg px-4 py-2 text-sm font-bold focus:outline-none focus:border-indigo-500"
          >
            {agencies.map(a => (
              <option key={a.slug} value={a.slug}>{a.display_name}</option>
            ))}
          </select>
        </div>
      </header>

      {/* Full Screen Map */}
      <main className="flex-1 relative">
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
          <ChangeView center={center} />
        </MapContainer>

        {/* Overlay HUD (Mini-App Start) */}
        <div className="absolute top-6 left-6 z-[1000] w-80 space-y-4">
          <div className="bg-[#0f0f0f]/80 backdrop-blur-md border border-white/10 p-6 rounded-2xl shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <span className="text-[10px] font-bold tracking-widest text-indigo-400 uppercase">Mini-App 01</span>
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            </div>
            <h2 className="text-xl font-black mb-1 leading-tight italic">Interval</h2>
            <p className="text-xs text-white/50 leading-relaxed">The physical frequency layer. See the promise, find the gaps.</p>
            
            <div className="mt-6 pt-6 border-t border-white/5">
              <button className="w-full py-3 bg-white text-black rounded-xl font-black text-xs flex items-center justify-center gap-2 hover:bg-white/90 transition-all">
                Coming Soon <ChevronRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
