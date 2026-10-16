import { useState } from 'react';
import type { DashboardBand } from '../../../shared/liveDashboard';
import { useLiveDashboard } from '../../hooks/useLiveDashboard';
import PageShell from '../ui/PageShell';
import Pill from '../ui/Pill';
import RouteStrip, { routeStripFromV3, type RouteStripMode } from './RouteStrip';

const ROUTES = ['510', '505'] as const;
const BANDS: [DashboardBand, string][] = [['all', 'All day'], ['amPeak', 'AM peak'], ['midday', 'Midday'], ['pmPeak', 'PM peak'], ['evening', 'Evening']];

function RouteBlock({ route, mode, band }: { route: string; mode: RouteStripMode; band: DashboardBand }) {
  const state = useLiveDashboard('ttc', route);
  if (state.kind === 'loading') return <p className="text-sm text-[var(--text-muted)]">Loading the {route}…</p>;
  if (state.kind === 'error') return <p className="text-sm text-[var(--text-muted)]">{state.reason}</p>;
  const data = state.data;
  if (data.status !== 'ready') return <p className="text-sm text-[var(--text-muted)]">{data.reason}</p>;
  const dirs = Object.keys(data.v3.directionLabels).map(Number).sort();
  const wide = routeStripFromV3(data.v3, dirs[0], band, data.uncertainStart);
  return (
    <section className="mt-10" aria-labelledby={`route-${route}`}>
      <h2 id={`route-${route}`} className="text-xl font-black tracking-tight">{route}</h2>
      {data.note && <p className="mt-1 max-w-2xl text-xs text-[var(--text-dim)]">{data.note}</p>}
      <div className="mt-4 grid gap-8 lg:grid-cols-2">
        {dirs.map(d => {
          const dir = routeStripFromV3(data.v3, d, band, data.uncertainStart);
          return (
            <div key={d} className="min-w-0">
              <h3 className="mb-2 text-base font-black">{dir.label}</h3>
              <RouteStrip stops={dir.stops} mode={mode} directionLabel={dir.label} delaysStart={dir.delaysStart} bunchingForms={dir.bunchingForms} />
            </div>
          );
        })}
      </div>
      <div className="mt-8">
        <h3 className="mb-2 text-base font-black">{wide.label}, full width</h3>
        <RouteStrip stops={wide.stops} mode={mode} directionLabel={wide.label} delaysStart={wide.delaysStart} bunchingForms={wide.bunchingForms} />
      </div>
    </section>
  );
}

/** Dev-only page for the route strip, drawn from the real 510 and 505 analysis files. */
export default function RouteStripDemo() {
  const [mode, setMode] = useState<RouteStripMode>('delay');
  const [band, setBand] = useState<DashboardBand>('amPeak');
  return (
    <PageShell>
      <h1 className="text-2xl font-black tracking-tight">Route strip</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--text-muted)]">Each stop in route order, coloured by its typical delay or by how often gaps are too short or too long. Dev only.</p>
      <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Colour by">
          <Pill selected={mode === 'delay'} onClick={() => setMode('delay')}>Delay</Pill>
          <Pill selected={mode === 'bunching'} onClick={() => setMode('bunching')}>Bunching</Pill>
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Time of day">
          {BANDS.map(([k, l]) => <Pill key={k} selected={band === k} onClick={() => setBand(k)}>{l}</Pill>)}
        </div>
      </div>
      {ROUTES.map(r => <RouteBlock key={r} route={r} mode={mode} band={band} />)}
    </PageShell>
  );
}
