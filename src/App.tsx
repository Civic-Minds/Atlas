import React, { useEffect } from 'react';
import { Outlet, NavLink, Navigate, useLocation } from 'react-router-dom';
import { Map as MapIcon } from 'lucide-react';
import { useAtlasStore } from './store/atlas';

const MINI_APPS = [
  { id: 'interval', label: 'Interval', live: true },
  { id: 'live', label: 'Live', live: false },
  { id: 'reliability', label: 'Reliability', live: false },
];

export default function App() {
  const { agencies, selectedAgency, selectAgency, setAgencies } = useAtlasStore();
  const location = useLocation();

  const isRoot = location.pathname === '/';

  useEffect(() => {
    fetch('/api/agencies')
      .then((res) => res.json())
      .then((data) => setAgencies(data))
      .catch((err) => console.error('Failed to fetch agencies', err));
  }, []);

  if (isRoot) return <Navigate to="/interval" replace />;

  return (
    <div className="flex flex-col h-screen w-screen bg-[#0a0a0a] text-white font-sans overflow-hidden">
      <header className="h-16 border-b border-white/10 flex items-center justify-between px-6 shrink-0 bg-[#0f0f0f]">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
              <MapIcon className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-lg font-black tracking-tighter uppercase">Atlas</h1>
          </div>

          <nav className="flex items-center gap-1">
            {MINI_APPS.map((app) =>
              app.live ? (
                <NavLink
                  key={app.id}
                  to={`/${app.id}`}
                  className={({ isActive }) =>
                    `px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      isActive
                        ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30'
                        : 'text-white/40 hover:text-white/70'
                    }`
                  }
                >
                  {app.label}
                </NavLink>
              ) : (
                <span
                  key={app.id}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold text-white/20 cursor-not-allowed"
                  title="Coming soon"
                >
                  {app.label}
                </span>
              )
            )}
          </nav>
        </div>

        <select
          value={selectedAgency}
          onChange={(e) => selectAgency(e.target.value)}
          className="bg-[#1a1a1a] border border-white/10 rounded-lg px-4 py-2 text-sm font-bold focus:outline-none focus:border-indigo-500"
        >
          {agencies.map((a) => (
            <option key={a.slug} value={a.slug}>
              {a.display_name}
            </option>
          ))}
        </select>
      </header>

      <main className="flex-1 relative overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}
