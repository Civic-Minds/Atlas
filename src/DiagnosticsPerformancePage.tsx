import { useCallback, useEffect, useMemo, useState } from 'react';
import { Map as MapIcon } from 'lucide-react';
import { useAgencies } from './hooks/useAgencies';
import { ATLAS_MODE } from '../shared/config';
import { getAtlasMark, markAtlasOnce } from './lib/performance';
import { FLOATING_CARD } from './styles';

interface PerformanceMetric {
  label: string;
  value: string;
  detail?: string;
}

function formatMs(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) ? 'Not available' : `${Math.round(value)} ms`;
}

function readMetrics(): PerformanceMetric[] {
  const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
  const paints = performance.getEntriesByType('paint');
  const fcp = paints.find(entry => entry.name === 'first-contentful-paint')?.startTime;

  return [
    { label: 'Time to first byte', value: formatMs(navigation?.responseStart ? navigation.responseStart - navigation.requestStart : null) },
    { label: 'First contentful paint', value: formatMs(fcp) },
    { label: 'DOM interactive', value: formatMs(navigation?.domInteractive) },
    { label: 'DOMContentLoaded', value: formatMs(navigation?.domContentLoadedEventEnd) },
    { label: 'Page load event', value: formatMs(navigation?.loadEventEnd), detail: 'The browser finished loading the document.' },
    { label: 'Largest contentful paint', value: 'Refresh to capture', detail: 'LCP is observed while this page is open.' },
    { label: 'App ready', value: formatMs(getAtlasMark('app-ready')) },
    { label: 'Agency catalog ready', value: formatMs(getAtlasMark('agency-catalog-ready')) },
    { label: 'Network data ready', value: formatMs(getAtlasMark('network-data-ready')) },
    { label: 'Document transfer', value: navigation?.transferSize ? `${Math.round(navigation.transferSize / 1024)} KB` : 'Not available' },
  ];
}

export default function DiagnosticsPerformancePage() {
  const { agencies, agenciesLoadState } = useAgencies();
  const [metrics, setMetrics] = useState<PerformanceMetric[]>(readMetrics);
  const [lcp, setLcp] = useState<number | null>(null);

  useEffect(() => {
    markAtlasOnce('app-ready');
  }, []);

  const refreshMetrics = useCallback(() => {
    setMetrics(readMetrics());
  }, []);

  useEffect(() => {
    refreshMetrics();
  }, [agenciesLoadState, refreshMetrics]);

  useEffect(() => {
    if (!('PerformanceObserver' in window)) return;
    const observer = new PerformanceObserver(list => {
      const entries = list.getEntries();
      const latest = entries.at(-1);
      if (latest) {
        setLcp(latest.startTime);
        refreshMetrics();
      }
    });
    try {
      observer.observe({ type: 'largest-contentful-paint', buffered: true });
    } catch {
      return undefined;
    }
    return () => observer.disconnect();
  }, [refreshMetrics]);

  const rows = useMemo(
    () => metrics.map(metric => metric.label === 'Largest contentful paint' ? { ...metric, value: formatMs(lcp) } : metric),
    [metrics, lcp],
  );

  return (
    <div className="min-h-screen w-full bg-[var(--bg-app)] text-[var(--text-primary)] font-sans">
      <div className="sticky top-0 z-10 bg-[var(--bg-app)]/95 backdrop-blur-md border-b border-[var(--border-primary)] px-6 py-4 flex items-center gap-2">
        <a href="/" aria-label="Back to the frequency map" className="flex items-center gap-2">
          <div className="w-8 h-8 bg-[var(--accent)] rounded-full flex items-center justify-center shrink-0 shadow-2xl hover:opacity-80 transition-opacity">
            <MapIcon className="w-3.5 h-3.5 text-white" />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-xs sm:text-sm font-black text-[var(--text-primary)]">Atlas</span>
            <span className="text-[8px] sm:text-[10px] text-[var(--text-dim)]">by Civic Minds</span>
          </div>
        </a>
        <span className="w-px h-4 bg-[var(--border-primary)] shrink-0 ml-1" aria-hidden="true" />
        <span className="text-xl sm:text-2xl font-black text-[var(--text-primary)] leading-none">Performance</span>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="ml-auto px-3 py-1.5 rounded-full bg-[var(--bg-btn-hover)] text-xs font-bold hover:text-[var(--accent)]"
        >
          Reload and measure
        </button>
      </div>

      <main className="p-6 max-w-4xl mx-auto space-y-5">
        <div className={`${FLOATING_CARD} p-5 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm`}>
          <div><div className="text-[10px] text-[var(--text-dim)]">Mode</div><div className="font-black">{ATLAS_MODE}</div></div>
          <div><div className="text-[10px] text-[var(--text-dim)]">Visible agencies</div><div className="font-black">{agenciesLoadState === 'ready' ? agencies.length : 'Loading…'}</div></div>
          <div><div className="text-[10px] text-[var(--text-dim)]">URL</div><div className="font-black">{window.location.pathname}</div></div>
          <div><div className="text-[10px] text-[var(--text-dim)]">Captured</div><div className="font-black">{new Date().toLocaleTimeString()}</div></div>
        </div>

        <section className={`${FLOATING_CARD} overflow-hidden`} aria-labelledby="performance-metrics-heading">
          <h1 id="performance-metrics-heading" className="px-5 py-4 text-lg font-black border-b border-[var(--border-primary)]">Load measurements</h1>
          <div className="divide-y divide-[var(--border-primary)]">
            {rows.map(metric => (
              <div key={metric.label} className="px-5 py-3 flex items-center justify-between gap-4">
                <div><div className="text-sm font-bold">{metric.label}</div>{metric.detail && <div className="text-[10px] text-[var(--text-dim)]">{metric.detail}</div>}</div>
                <div className="text-sm font-black text-right whitespace-nowrap">{metric.value}</div>
              </div>
            ))}
          </div>
        </section>

        <p className="text-xs text-[var(--text-dim)]">Use the reload button for a fresh navigation measurement. These timings are local browser measurements; production also reports Vercel Speed Insights.</p>
      </main>
    </div>
  );
}
