import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAgencies } from './hooks/useAgencies';
import { ATLAS_MODE } from '../shared/config';
import { getAtlasMark, markAtlasOnce } from './lib/performance';
import DocsPageLayout from './components/ui/DocsPageLayout';
import PageSection, { PageTable } from './components/ui/PageSection';
import { PageTitle } from './components/ui/PageTitle';
import DataTable, { type DataTableColumn } from './components/ui/DataTable';
import { DIAGNOSTICS_PERFORMANCE_PATH, INTERNAL_GROUPS } from '../shared/internalPages';
import Pill from './components/ui/Pill';

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
    { label: 'Agency catalogue ready', value: formatMs(getAtlasMark('agency-catalog-ready')) },
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

  const page = INTERNAL_GROUPS.flatMap(g => g.pages).find(x => x.path === DIAGNOSTICS_PERFORMANCE_PATH)!;
  useEffect(() => { document.title = `${page.title} | Atlas`; }, [page.title]);
  const facts: Array<{ label: string; value: ReactNode }> = [
    { label: 'Mode', value: ATLAS_MODE },
    { label: 'Visible agencies', value: agenciesLoadState === 'ready' ? agencies.length : 'Loading…' },
    // A long path has no spaces to wrap at: it shortens with "…", full path on hover (#1101).
    { label: 'URL', value: <span className="block max-w-[24rem] truncate" title={window.location.pathname}>{window.location.pathname}</span> },
    { label: 'Captured', value: new Date().toLocaleTimeString() },
  ];
  const factColumns: DataTableColumn<(typeof facts)[number]>[] = [
    { key: 'label', header: 'This page', rowHeader: true, width: 16, className: 'font-normal', cell: f => f.label },
    { key: 'value', header: 'Value', cell: f => f.value },
  ];
  const metricColumns: DataTableColumn<PerformanceMetric>[] = [
    { key: 'label', header: 'Measurement', rowHeader: true, width: 16, className: 'font-normal whitespace-nowrap', cell: m => m.label },
    { key: 'detail', header: 'Note', align: 'left', grow: true, cell: m => m.detail ?? '' },
    { key: 'value', header: 'Time', className: 'whitespace-nowrap', cell: m => m.value },
  ];

  return (
    <DocsPageLayout width="wide">
      <PageTitle>{page.title}</PageTitle>
      <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--text-muted)]">{page.description}</p>
      <div className="mt-6">
        <Pill tone="outline" size="segment" onClick={() => window.location.reload()}>Reload and measure</Pill>
      </div>
      <PageSection id="performance-page" title="This page">
        <PageTable>
          <DataTable layout="page" caption="This page" columns={factColumns} rows={facts} rowKey={f => f.label} />
        </PageTable>
      </PageSection>
      <PageSection id="performance-metrics-heading" title="Timings" intro="Use the reload button for a fresh navigation measurement. These timings are local browser measurements; production also reports Vercel Speed Insights.">
        <PageTable>
          <DataTable layout="page" caption="Timings" columns={metricColumns} rows={rows} rowKey={m => m.label} />
        </PageTable>
      </PageSection>
    </DocsPageLayout>
  );
}
