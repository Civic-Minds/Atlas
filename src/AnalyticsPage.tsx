import { useEffect, useState } from 'react';
import { ANALYTICS_API_URL, ANALYTICS_COPY as C, type AnalyticsResponse, type AnalyticsRow, type AnalyticsWindow } from '../shared/analytics';
import DocsPageLayout from './components/ui/DocsPageLayout';
import PageSection, { PageTable, PAGE_LEAD } from './components/ui/PageSection';
import { PageTitle } from './components/ui/PageTitle';
import DataTable, { type DataTableColumn } from './components/ui/DataTable';
import { tabTitle } from '../shared/pageNames';

/**
 * CIV-2068: the internal Analytics page (dev server only, listed on /internal). Google Analytics figures read through the
 * local API (local-api/analytics.ts), which holds the read-only key; the browser only sees the figures.
 */

const sectionId = (days: number) => `analytics-${days}`;
const figure = (n: number) => n.toLocaleString('en-CA');

function rowColumns(nameHeader: string, valueHeader: string): DataTableColumn<AnalyticsRow>[] {
  return [
    { key: 'name', header: nameHeader, rowHeader: true, cell: r => r.name },
    { key: 'value', header: <span className="block text-right">{valueHeader}</span>, className: 'text-right', cell: r => figure(r.value) },
  ];
}
const totalColumns: DataTableColumn<{ label: string; value: number }>[] = [
  { key: 'label', header: C.figure, rowHeader: true, cell: r => r.label },
  { key: 'value', header: <span className="block text-right">{C.count}</span>, className: 'text-right', cell: r => figure(r.value) },
];

function Window({ w }: { w: AnalyticsWindow }) {
  const totals = [
    { label: C.totals.visits, value: w.totals.visits },
    { label: C.totals.visitors, value: w.totals.visitors },
    { label: C.totals.pageViews, value: w.totals.pageViews },
  ];
  return (
    <PageSection id={sectionId(w.days)} title={C.windowHeading(w.days)}>
      <PageTable><DataTable variant="ruled" columns={totalColumns} rows={totals} rowKey={r => r.label} caption={C.windowHeading(w.days)} /></PageTable>
      <PageTable><DataTable variant="ruled" columns={rowColumns(C.page, C.views)} rows={w.pages} rowKey={r => r.name} caption={C.pages} /></PageTable>
      <PageTable><DataTable variant="ruled" columns={rowColumns(C.country, C.visitorsColumn)} rows={w.countries} rowKey={r => r.name} caption={C.countries} /></PageTable>
    </PageSection>
  );
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  useEffect(() => { document.title = tabTitle(C.title); }, []);
  useEffect(() => {
    fetch(ANALYTICS_API_URL).then(r => r.json() as Promise<AnalyticsResponse>).then(setData).catch(() => setData({ available: false }));
  }, []);
  const windows = data?.available ? data.windows : [];
  return (
    <DocsPageLayout contents={{ title: C.title, items: windows.map(w => ({ id: sectionId(w.days), label: C.windowHeading(w.days) })) }}>
      <PageTitle>{C.title}</PageTitle>
      <p className={PAGE_LEAD}>{C.intro}</p>
      {data == null ? <p className={PAGE_LEAD}>{C.loading}</p>
        : !data.available ? <p className={PAGE_LEAD}>{C.unavailable}</p>
          : windows.map(w => <Window key={w.days} w={w} />)}
    </DocsPageLayout>
  );
}
