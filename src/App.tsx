import React, { useState, useEffect } from 'react';
import { Map as MapIcon } from 'lucide-react';
import Interval from './apps/Interval';

interface Agency {
  slug: string;
  name: string;
  center: [number, number];
}

export default function App() {
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [selected, setSelected] = useState<string>('');

  useEffect(() => {
    fetch('/data/index.json')
      .then(r => r.json())
      .then(data => {
        setAgencies(data.agencies);
        if (data.agencies.length > 0) setSelected(data.agencies[0].slug);
      })
      .catch(() => {});
  }, []);

  const agency = agencies.find(a => a.slug === selected);

  return (
    <div className="flex flex-col h-screen w-screen bg-[#0a0a0a] text-white font-sans overflow-hidden">
      <header className="h-16 border-b border-white/10 flex items-center justify-between px-6 shrink-0 bg-[#0f0f0f]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
            <MapIcon className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-lg font-black tracking-tighter uppercase">Atlas</h1>
        </div>

        {agencies.length > 0 && (
          <select
            value={selected}
            onChange={e => setSelected(e.target.value)}
            className="bg-[#1a1a1a] border border-white/10 rounded-lg px-4 py-2 text-sm font-bold focus:outline-none focus:border-indigo-500"
          >
            {agencies.map(a => (
              <option key={a.slug} value={a.slug}>{a.name}</option>
            ))}
          </select>
        )}
      </header>

      <main className="flex-1 relative overflow-hidden">
        {agency ? (
          <Interval slug={agency.slug} center={agency.center} />
        ) : (
          <div className="flex items-center justify-center h-full text-white/20 text-sm">
            No agency data. Run <code className="mx-1 text-indigo-400">npm run process</code> to add one.
          </div>
        )}
      </main>
    </div>
  );
}
