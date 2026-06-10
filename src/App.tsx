import React, { useState, useEffect } from 'react';
import { Map as MapIcon } from 'lucide-react';
import Interval from './apps/Interval';

export interface Agency {
  slug: string;
  name: string;
  center: [number, number];
  url: string;
}

export default function App() {
  const [agencies, setAgencies] = useState<Agency[]>([]);

  useEffect(() => {
    fetch('/data/index.json')
      .then(r => r.json())
      .then(data => setAgencies(data.agencies))
      .catch(() => {});
  }, []);

  return (
    <div className="flex flex-col h-screen w-screen bg-[#0a0a0a] text-white font-sans overflow-hidden">
      <header className="h-16 border-b border-white/10 flex items-center justify-between px-6 shrink-0 bg-[#0f0f0f]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
            <MapIcon className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-lg font-black tracking-tighter uppercase">Atlas</h1>
        </div>
        <span className="text-[10px] font-bold uppercase tracking-widest text-white/30">
          Greater Toronto &amp; Hamilton Area
        </span>
      </header>

      <main className="flex-1 relative overflow-hidden">
        {agencies.length > 0 ? (
          <Interval agencies={agencies} />
        ) : (
          <div className="flex items-center justify-center h-full text-white/20 text-sm">
            Loading…
          </div>
        )}
      </main>
    </div>
  );
}
