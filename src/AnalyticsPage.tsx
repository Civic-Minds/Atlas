import { useEffect, useId, useState } from 'react';
import {
  ANALYTICS_API_URL, ANALYTICS_COPY as C, ANALYTICS_MAIN_DAYS, actionName, GA_REGION_ALIASES, PAGE_VIEWS_FIXED_ON, TILE_MAP_COUNTRIES, placeName, renamedRows, shortLabel, sourceName,
  type AnalyticsResponse, type AnalyticsRow, type AnalyticsTotals, type AnalyticsWindow,
} from '../shared/analytics';
import DocsPageLayout from './components/ui/DocsPageLayout';
import PageSection, { PAGE_LEAD } from './components/ui/PageSection';
import { PageTitle } from './components/ui/PageTitle';
import Card from './components/ui/Card';
import { type DataTableColumn } from './components/ui/DataTable';
import LineChart from './components/charts/LineChart';
import RankedBars from './components/charts/RankedBars';
import TileMap, { type MapTile } from './components/charts/TileMap';
import ChartTableDetails from './components/charts/ChartTableDetails';
import { STORY_CHART_PANEL } from './pageStyles';
import { REGION_TILES } from './data/regionTileGrid';
import { tabTitle } from '../shared/pageNames';
import { countText, percentText, signedPercentText } from '../shared/numberText';
import { minutesText } from '../shared/liveFormat';
import { dateRange, isoDate, shortDate } from '../shared/dateText';
import { MISSING_VALUE } from '../shared/missingValue';

/**
 * CIV-2068: the internal Analytics page (dev server only, listed on /internal). Google Analytics figures read through the
 * local API (local-api/analytics.ts), which holds the read-only key; the browser only sees the figures.
 * Ryan, 2026-11-22: "Could the http://localhost:5182/internal/analytics page be any better? Like a chart or something or a
 * more interesting way of showing the data based on our existing designs elsewhere", picked 1 (all four): key figures with
 * the change from the period before (Free Child Fares' figure cards), visitors per day (the chart collection's LineChart),
 * top pages and sources as the Frequent Service story's ranked bars, and a note while a period still holds the page views
 * GA over-counted before PAGE_VIEWS_FIXED_ON. Then: "I don't like how Last 7 and Last 28 are basically two separate pages
 * on top of each other" and "Maybe last 14 and 28?", then "instead of a 7/14/28 day switcher ... what if we just showed all
 * that data without needing a switcher like intuitively" (every chart shows 28 days; each key figure adds its last-14-days
 * count), and "Should countries
 * be a basic lil map" (Free Child Fares' state and province tile map, with countries outside it listed beside). Then, asked
 * what's missing, "Yes to all": time per visit and returning visitors as key figures, what visitors did (Atlas's own
 * events), and top cities under the map.
 */

const SECTIONS = [
  { id: 'analytics-overview', label: C.figuresHeading, nav: C.nav.overview },
  { id: 'analytics-daily', label: C.daily, nav: C.nav.daily },
  { id: 'analytics-actions', label: C.actions, nav: C.nav.actions },
  { id: 'analytics-sources', label: C.sources, nav: C.nav.sources },
  { id: 'analytics-pages', label: C.pages, nav: C.nav.pages },
  { id: 'analytics-where', label: C.where, nav: C.nav.where },
] as const;
const [OVERVIEW, DAILY, ACTIONS, SOURCES, PAGES, WHERE] = SECTIONS;
/** Room for a page address such as "/agency/metrostlouis" beside its bar. */
const BAR_LABEL_WIDTH = '11rem';
const BAR_FILL = 'var(--text-muted)';
/** Tile shading: Free Child Fares' fill (text-muted mixed into the panel), from faint for one visitor to strong for the most. */
const tileFill = (mix: number) => `color-mix(in srgb, var(--text-muted) ${mix}%, transparent)`;
const TILE_MIX_MIN = 15, TILE_MIX_MAX = 90, TILE_DARK_FROM = 85;
const PANEL = `${STORY_CHART_PANEL} p-5 sm:p-8`;

function rowColumns(nameHeader: string, valueHeader: string): DataTableColumn<AnalyticsRow>[] {
  return [
    { key: 'name', header: nameHeader, rowHeader: true, cell: r => r.name },
    { key: 'value', header: <span className="block text-right">{valueHeader}</span>, className: 'text-right', cell: r => countText(r.value) },
  ];
}

function changeLine(now: number, before: number, days: number): string {
  return before > 0 ? C.change(signedPercentText((now - before) / before), days) : C.noEarlier(days);
}

/** True while the period starts before GA stopped counting map moves as page views. */
function overCounted(w: AnalyticsWindow): boolean {
  const firstDay = isoDate(w.daily[0]?.date);
  return firstDay != null && firstDay < PAGE_VIEWS_FIXED_ON;
}

/** One key figure: its name, the main period's figure, the shorter period's, and a line under them. */
function Figure({ name, value, shorter, note }: { name: string; value: string; shorter?: string; note: string }) {
  return (
    <Card tone="surface" padding="tight">
      <dt className="text-xs font-bold leading-5 text-[var(--text-muted)]">{name}</dt>
      <dd className="mt-1 text-3xl font-black tracking-tight sm:text-4xl">{value}</dd>
      {shorter != null && <dd className="mt-1 text-xs leading-5 text-[var(--text-primary)]">{shorter}</dd>}
      <dd className="mt-1 text-xs leading-5 text-[var(--text-muted)]">{note}</dd>
    </Card>
  );
}

const secondsText = (seconds: number) => minutesText(seconds / 60);

function Figures({ w, shorter }: { w: AnalyticsWindow; shorter?: AnalyticsWindow }) {
  const counts: Array<keyof Omit<AnalyticsTotals, 'visitSeconds'>> = ['visitors', 'visits', 'pageViews'];
  const short = (text: string) => (shorter ? C.shorter(shorter.days, text) : undefined);
  return (
    <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
      {counts.map(k => (
        <Figure key={k} name={C.totals[k]} value={countText(w.totals[k])} shorter={short(countText(shorter?.totals[k] ?? 0))} note={changeLine(w.totals[k], w.previous[k], w.days)} />
      ))}
      <Figure name={C.totals.visitSeconds} value={secondsText(w.totals.visitSeconds)} shorter={short(secondsText(shorter?.totals.visitSeconds ?? 0))}
        note={changeLine(w.totals.visitSeconds, w.previous.visitSeconds, w.days)} />
      <Figure name={C.totals.returning} value={countText(w.returning)} shorter={short(countText(shorter?.returning ?? 0))}
        note={C.returningShare(percentText(w.totals.visitors > 0 ? w.returning / w.totals.visitors : 0))} />
    </dl>
  );
}

function Bars({ heading, rows, nameHeader, valueHeader, nameOf = n => n }: { heading: string; rows: AnalyticsRow[]; nameHeader: string; valueHeader: string; nameOf?: (name: string) => string }) {
  const tableId = useId();
  if (!rows.length) return null;
  const named = renamedRows(rows, nameOf);
  return (
    <>
      <RankedBars
        label={C.barsLabel(heading)}
        labelWidth={BAR_LABEL_WIDTH}
        bars={named.map(r => ({ key: r.name, label: shortLabel(r.name), value: r.value, fill: BAR_FILL, sentence: `${r.name}: ${countText(r.value)}` }))}
        max={Math.max(...named.map(r => r.value))}
        details={tableId}
      />
      <ChartTableDetails id={tableId} caption={heading} columns={rowColumns(nameHeader, valueHeader)} rows={named} rowKey={r => r.name} />
    </>
  );
}

function Where({ w }: { w: AnalyticsWindow }) {
  const tableId = useId();
  const visitors = new Map<string, number>();
  for (const r of w.regions) {
    const name = GA_REGION_ALIASES[r.name] ?? r.name;
    if (REGION_TILES[name]) visitors.set(name, (visitors.get(name) ?? 0) + r.value);
  }
  const most = Math.max(1, ...visitors.values());
  const tiles: MapTile[] = Object.entries(REGION_TILES).map(([region, { abbr, col, row }]) => {
    const n = visitors.get(region) ?? 0;
    const mix = n > 0 ? Math.round(TILE_MIX_MIN + (TILE_MIX_MAX - TILE_MIX_MIN) * (n / most)) : 0;
    return { key: region, abbr, col, row, value: n > 0 ? countText(n) : MISSING_VALUE, fill: n > 0 ? tileFill(mix) : 'none', darkFill: mix >= TILE_DARK_FROM, sentence: C.regionSentence(region, countText(n)) };
  });
  const rows = [...visitors].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  const elsewhere = w.countries.filter(c => !TILE_MAP_COUNTRIES.includes(c.name));
  return (
    <>
      <div className={PANEL}>
        <TileMap tiles={tiles} label={C.mapLabel(w.days)} details={tableId} />
        <ChartTableDetails id={tableId} caption={C.where} columns={rowColumns(C.region, C.visitorsColumn)} rows={rows} rowKey={r => r.name} />
      </div>
      {w.cities.length > 0 && (
        <div className={`mt-4 ${PANEL}`}>
          <h3 className="mb-4 text-xs font-bold text-[var(--text-primary)]">{C.cities}</h3>
          <Bars heading={C.cities} rows={w.cities} nameHeader={C.city} valueHeader={C.visitorsColumn} />
        </div>
      )}
      {elsewhere.length > 0 && (
        <div className={`mt-4 ${PANEL}`}>
          <h3 className="mb-4 text-xs font-bold text-[var(--text-primary)]">{C.otherCountries}</h3>
          <Bars heading={C.otherCountries} rows={elsewhere} nameHeader={C.country} valueHeader={C.visitorsColumn} nameOf={placeName} />
        </div>
      )}
    </>
  );
}

function Period({ w, shorter }: { w: AnalyticsWindow; shorter?: AnalyticsWindow }) {
  return (
    <>
      <PageSection id={OVERVIEW.id} title={OVERVIEW.nav}>
        <Figures w={w} shorter={shorter} />
      </PageSection>
      {w.daily.length > 1 && (
        <PageSection id={DAILY.id} title={DAILY.nav}>
          <div className={`mt-4 ${PANEL}`}>
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
              xTickLabels={(_p, i) => i % 7 === 0}
            />
          </div>
        </PageSection>
      )}
      {w.actions.length > 0 && (
        <PageSection id={ACTIONS.id} title={ACTIONS.nav}>
          <div className={`mt-4 ${PANEL}`}><Bars heading={C.actions} rows={w.actions} nameHeader={C.action} valueHeader={C.times} nameOf={actionName} /></div>
        </PageSection>
      )}
      <PageSection id={SOURCES.id} title={SOURCES.nav}>
        <div className={`mt-4 ${PANEL}`}><Bars heading={C.sources} rows={w.sources} nameHeader={C.source} valueHeader={C.visitsColumn} nameOf={sourceName} /></div>
      </PageSection>
      <PageSection id={PAGES.id} title={PAGES.nav}>
        <div className={`mt-4 ${PANEL}`}><Bars heading={C.pages} rows={w.pages} nameHeader={C.page} valueHeader={C.views} nameOf={n => (n === '/' ? C.homePage : n)} /></div>
      </PageSection>
      <PageSection id={WHERE.id} title={WHERE.nav}>
        <div className="mt-4"><Where w={w} /></div>
      </PageSection>
    </>
  );
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  useEffect(() => { document.title = tabTitle(C.title); }, []);
  useEffect(() => {
    fetch(ANALYTICS_API_URL).then(r => r.json() as Promise<AnalyticsResponse>).then(setData).catch(() => setData({ available: false }));
  }, []);
  const windows = data?.available ? data.windows : [];
  const w = windows.find(x => x.days === ANALYTICS_MAIN_DAYS);
  const shorter = windows.find(x => x.days < ANALYTICS_MAIN_DAYS);
  return (
    <DocsPageLayout contents={{ title: C.title, items: w ? SECTIONS.map(s => ({ id: s.id, label: s.nav })) : [] }}>
      <PageTitle>{C.title}</PageTitle>
      <p className={PAGE_LEAD}>{C.intro(ANALYTICS_MAIN_DAYS)}</p>
      {data == null ? <p className={PAGE_LEAD}>{C.loading}</p>
        : !w ? <p className={PAGE_LEAD}>{C.unavailable}</p>
          : (
            <>
              {overCounted(w) && <p className="mt-3 text-sm leading-6 text-[var(--text-muted)]">{C.pageViewsNote(shortDate(PAGE_VIEWS_FIXED_ON) ?? PAGE_VIEWS_FIXED_ON)}</p>}
              <Period w={w} shorter={shorter} />
            </>
          )}
    </DocsPageLayout>
  );
}
