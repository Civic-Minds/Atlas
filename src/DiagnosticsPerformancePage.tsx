import { agencyEntryCount } from '../shared/agencyGroups';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAgencies } from './hooks/useAgencies';
import { ATLAS_MODE } from '../shared/config';
import { getAtlasMark, markAtlasOnce } from './lib/performance';
import DocsPageLayout from './components/ui/DocsPageLayout';
import PageSection, { PageTable, PAGE_LEAD } from './components/ui/PageSection';
import { PageTitle } from './components/ui/PageTitle';
import DataTable, { type DataTableColumn } from './components/ui/DataTable';
import { DIAGNOSTICS_PERFORMANCE_PATH, INTERNAL_GROUPS } from '../shared/internalPages';
import Pill from './components/ui/Pill';
import { clsFromShifts, clsText, goodThresholdText, inpFromEvents, vitalRating, type InteractionEvent, type LayoutShift, type VitalKey } from './lib/webVitals';

interface PerformanceMetric {
  label: string;
  value: string;
  detail?: string;
  /** A Core Web Vital, shown against Google's thresholds (src/lib/webVitals.ts). */
  vital?: VitalKey;
  raw?: number | null;
}

function formatMs(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) ? 'Not available' : `${Math.round(value)} ms`;
}

const msMetric = (value: number | null | undefined) => ({ value: formatMs(value), raw: value ?? null });

function readMetrics(): PerformanceMetric[] {
  const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
  const paints = performance.getEntriesByType('paint');
  const fcp = paints.find(entry => entry.name === 'first-contentful-paint')?.startTime;

  return [
    { label: 'Time to first byte', vital: 'ttfb', ...msMetric(navigation?.responseStart ? navigation.responseStart - navigation.requestStart : null) },
    { label: 'First contentful paint', vital: 'fcp', ...msMetric(fcp) },
    { label: 'DOM interactive', value: formatMs(navigation?.domInteractive) },
    { label: 'DOMContentLoaded', value: formatMs(navigation?.domContentLoadedEventEnd) },
    { label: 'Page load event', value: formatMs(navigation?.loadEventEnd), detail: 'The browser finished loading the document.' },
    { label: 'Largest contentful paint', vital: 'lcp', value: 'Refresh to capture', detail: 'LCP is observed while this page is open.' },
    { label: 'Interaction to next paint', vital: 'inp', value: 'Click or type to capture', detail: 'The slowest response to a click, tap or key press on this page so far.' },
    { label: 'Cumulative layout shift', vital: 'cls', value: 'Not available', detail: 'How much the page jumped around while loading, as a score, not a time.' },
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
  const [inp, setInp] = useState<number | null>(null);
  const [cls, setCls] = useState<number | null>(null);

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

  // INP and CLS, observed while this page is open (CIV-2076).
  useEffect(() => {
    if (!('PerformanceObserver' in window)) return;
    const events: InteractionEvent[] = [];
    const shifts: LayoutShift[] = [];
    const observers: PerformanceObserver[] = [];
    const watch = (type: string, onEntries: (entries: PerformanceEntry[]) => void, extra: Record<string, unknown> = {}) => {
      const observer = new PerformanceObserver(list => onEntries(list.getEntries()));
      try {
        observer.observe({ type, buffered: true, ...extra } as PerformanceObserverInit);
        observers.push(observer);
      } catch { /* the browser doesn't report this entry type */ }
    };
    watch('event', entries => {
      events.push(...(entries as unknown as InteractionEvent[]).map(e => ({ interactionId: e.interactionId, duration: e.duration })));
      setInp(inpFromEvents(events));
    }, { durationThreshold: 16 });
    watch('layout-shift', entries => {
      shifts.push(...(entries as unknown as LayoutShift[]).map(e => ({ startTime: e.startTime, value: e.value, hadRecentInput: e.hadRecentInput })));
      setCls(clsFromShifts(shifts));
    });
    if (observers.length) setCls(c => c ?? 0);
    return () => observers.forEach(o => o.disconnect());
  }, []);

  const rows = useMemo(
    () => metrics.map(metric => {
      if (metric.vital === 'lcp') return { ...metric, value: formatMs(lcp), raw: lcp };
      if (metric.vital === 'inp' && inp != null) return { ...metric, value: formatMs(inp), raw: inp };
      if (metric.vital === 'cls') return { ...metric, value: clsText(cls), raw: cls };
      return metric;
    }),
    [metrics, lcp, inp, cls],
  );

  const page = INTERNAL_GROUPS.flatMap(g => g.pages).find(x => x.path === DIAGNOSTICS_PERFORMANCE_PATH)!;
  useEffect(() => { document.title = `${page.title} | Atlas`; }, [page.title]);
  const facts: Array<{ label: string; value: ReactNode }> = [
    { label: 'Mode', value: ATLAS_MODE },
    { label: 'Visible agencies', value: agenciesLoadState === 'ready' ? agencyEntryCount(agencies) : 'Loading…' },
    // A long path has no spaces to wrap at: it shortens with "…", full path on hover (#1101).
    { label: 'URL', value: <span className="block max-w-[24rem] truncate" title={window.location.pathname}>{window.location.pathname}</span> },
    { label: 'Captured', value: new Date().toLocaleTimeString() },
  ];
  const factColumns: DataTableColumn<(typeof facts)[number]>[] = [
    { key: 'label', header: 'This Page', rowHeader: true, width: 16, className: 'font-normal', cell: f => f.label },
    { key: 'value', header: 'Value', cell: f => f.value },
  ];
  const metricColumns: DataTableColumn<PerformanceMetric>[] = [
    { key: 'label', header: 'Measurement', rowHeader: true, width: 16, className: 'font-normal whitespace-nowrap', cell: m => m.label },
    { key: 'detail', header: 'Note', align: 'left', grow: true, cell: m => m.detail ?? '' },
    { key: 'value', header: 'Value', className: 'whitespace-nowrap', cell: m => m.value },
    { key: 'good', header: 'Good', className: 'whitespace-nowrap', cell: m => (m.vital ? goodThresholdText(m.vital) : '') },
    { key: 'rating', header: 'Rating', className: 'whitespace-nowrap', cell: m => (m.vital ? vitalRating(m.vital, m.raw) ?? '' : '') },
  ];

  return (
    <DocsPageLayout width="wide">
      <PageTitle>{page.title}</PageTitle>
      <p className={PAGE_LEAD}>{page.description}</p>
      <div className="mt-6">
        <Pill tone="outline" size="segment" onClick={() => window.location.reload()}>Reload and measure</Pill>
      </div>
      <PageSection id="performance-page" title="This Page">
        <PageTable>
          <DataTable variant="ruled" layout="page" caption="This Page" columns={factColumns} rows={facts} rowKey={f => f.label} />
        </PageTable>
      </PageSection>
      <PageSection id="performance-metrics-heading" title="Timings" intro="Use the reload button for a fresh navigation measurement. These timings are local browser measurements; production also reports Vercel Speed Insights. Good and Rating use Google’s Core Web Vitals thresholds.">
        <PageTable>
          <DataTable variant="ruled" layout="page" caption="Timings" columns={metricColumns} rows={rows} rowKey={m => m.label} />
        </PageTable>
      </PageSection>
    </DocsPageLayout>
  );
}
