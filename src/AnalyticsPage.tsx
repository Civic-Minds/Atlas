import { useEffect, useId, useState } from 'react';
import { ANALYTICS_API_URL, ANALYTICS_COPY as C, PAGE_VIEWS_FIXED_ON, type AnalyticsResponse, type AnalyticsRow, type AnalyticsTotals, type AnalyticsWindow } from '../shared/analytics';
import DocsPageLayout from './components/ui/DocsPageLayout';
import PageSection, { PAGE_LEAD } from './components/ui/PageSection';
import { PageTitle } from './components/ui/PageTitle';
import Card from './components/ui/Card';
import { type DataTableColumn } from './components/ui/DataTable';
import LineChart from './components/charts/LineChart';
import RankedBars from './components/charts/RankedBars';
import ChartTableDetails from './components/charts/ChartTableDetails';
import { CHART_TEXT } from './components/charts/useActivePart';
import { STORY_CHART_PANEL } from './pageStyles';
import { tabTitle } from '../shared/pageNames';
import { countText, signedPercentText } from '../shared/numberText';
import { dateRange, isoDate, shortDate } from '../shared/dateText';

/**
 * CIV-2068: the internal Analytics page (dev server only, listed on /internal). Google Analytics figures read through the
 * local API (local-api/analytics.ts), which holds the read-only key; the browser only sees the figures.
 * Ryan, 2026-11-22: "a chart or something or a more interesting way of showing the data based on our existing designs
 * elsewhere", picked 1 (all four): key figures with the change from the window before (Free Child Fares' figure cards),
 * visitors per day (the chart collection's LineChart), and top pages, sources and countries as the Frequent Service
 * story's ranked bars, plus a note while a window still holds the page views GA over-counted before PAGE_VIEWS_FIXED_ON.
 */

const sectionId = (days: number) => `analytics-${days}`;
/** Room for a page address such as "/agency/metrostlouis" beside its bar. */
const BAR_LABEL_WIDTH = '11rem';
const BAR_FILL = 'var(--text-muted)';

function rowColumns(nameHeader: string, valueHeader: string): DataTableColumn<AnalyticsRow>[] {
  return [
    { key: 'name', header: nameHeader, rowHeader: true, cell: r => r.name },
    { key: 'value', header: <span className="block text-right">{valueHeader}</span>, className: 'text-right', cell: r => countText(r.value) },
  ];
}

function changeLine(now: number, before: number, days: number): string {
  return before > 0 ? C.change(signedPercentText((now - before) / before), days) : C.noEarlier(days);
}

function Figures({ w }: { w: AnalyticsWindow }) {
  const keys: Array<keyof AnalyticsTotals> = ['visitors', 'visits', 'pageViews'];
  return (
    <dl className="mt-6 grid grid-cols-3 gap-3">
      {keys.map(k => (
        <Card key={k} tone="surface" padding="tight">
          <dt className="text-xs font-bold leading-5 text-[var(--text-muted)]">{C.totals[k]}</dt>
          <dd className="mt-1 text-3xl font-black tracking-tight sm:text-4xl">{countText(w.totals[k])}</dd>
          <dd className="mt-1 text-xs leading-5 text-[var(--text-muted)]">{changeLine(w.totals[k], w.previous[k], w.days)}</dd>
        </Card>
      ))}
    </dl>
  );
}

function ChartPanel({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <div className={`mt-6 ${STORY_CHART_PANEL} p-5 sm:p-8`}>
      <h3 className={`mb-4 font-bold ${CHART_TEXT}`}>{heading}</h3>
      {children}
    </div>
  );
}

function Bars({ heading, rows, nameHeader, valueHeader, nameOf = n => n }: { heading: string; rows: AnalyticsRow[]; nameHeader: string; valueHeader: string; nameOf?: (name: string) => string }) {
  const tableId = useId();
  if (!rows.length) return null;
  const named = rows.map(r => ({ name: nameOf(r.name), value: r.value }));
  return (
    <ChartPanel heading={heading}>
      <RankedBars
        label={C.barsLabel(heading)}
        labelWidth={BAR_LABEL_WIDTH}
        bars={named.map(r => ({ key: r.name, label: r.name, value: r.value, fill: BAR_FILL, sentence: `${r.name}: ${countText(r.value)}` }))}
        max={Math.max(...named.map(r => r.value))}
        details={tableId}
      />
      <ChartTableDetails id={tableId} caption={heading} columns={rowColumns(nameHeader, valueHeader)} rows={named} rowKey={r => r.name} />
    </ChartPanel>
  );
}

function Window({ w }: { w: AnalyticsWindow }) {
  const firstDay = isoDate(w.daily[0]?.date);
  const overCounted = firstDay != null && firstDay < PAGE_VIEWS_FIXED_ON;
  return (
    <PageSection id={sectionId(w.days)} title={C.windowHeading(w.days)}>
      <Figures w={w} />
      {overCounted && <p className="mt-3 text-xs leading-5 text-[var(--text-muted)]">{C.pageViewsNote(shortDate(PAGE_VIEWS_FIXED_ON) ?? PAGE_VIEWS_FIXED_ON)}</p>}
      {w.daily.length > 1 && (
        <ChartPanel heading={C.daily}>
          <LineChart
            label={C.dailyLabel(w.days)}
            yTitle={C.dailyAxis}
            yMin={0}
            formatY={countText}
            height={200}
            points={w.daily.map((d, i) => {
              const iso = isoDate(d.date) ?? d.date;
              return { x: i, y: d.visitors, label: dateRange(iso, iso), sentence: C.daySentence(countText(d.visitors)) };
            })}
            xTickLabels={(_p, i) => w.daily.length <= 7 || i % 7 === 0}
          />
        </ChartPanel>
      )}
      <Bars heading={C.sources} rows={w.sources} nameHeader={C.source} valueHeader={C.visitsColumn} nameOf={n => C.sourceNames[n] ?? n} />
      <Bars heading={C.pages} rows={w.pages} nameHeader={C.page} valueHeader={C.views} />
      <Bars heading={C.countries} rows={w.countries} nameHeader={C.country} valueHeader={C.visitorsColumn} />
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
