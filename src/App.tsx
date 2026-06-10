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
  const [lightMode, setLightMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('theme') === 'light';
    }
    return false;
  });

  useEffect(() => {
    fetch('/data/index.json')
      .then(r => r.json())
      .then(data => setAgencies(data.agencies))
      .catch(() => {});
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', lightMode ? 'light' : 'dark');
    localStorage.setItem('theme', lightMode ? 'light' : 'dark');
  }, [lightMode]);

  return (
    <div className="flex flex-col h-screen w-screen bg-[var(--bg-app)] text-[var(--text-primary)] font-sans overflow-hidden transition-colors duration-200">
      <header className="h-16 border-b border-[var(--border-primary)] flex items-center justify-between px-6 shrink-0 bg-[var(--bg-header)]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
            <MapIcon className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-lg font-black tracking-tighter uppercase">Atlas</h1>
        </div>
        <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
          Greater Toronto &amp; Hamilton Area
        </span>
      </header>

      <main className="flex-1 relative overflow-hidden">
        {agencies.length > 0 ? (
          <Interval 
            agencies={agencies} 
            lightMode={lightMode} 
            setLightMode={setLightMode} 
          />
        ) : (
          <div className="flex items-center justify-center h-full text-[var(--text-dim)] text-sm">
            Loading…
          </div>
        )}
      </main>
    </div>
  );
}
