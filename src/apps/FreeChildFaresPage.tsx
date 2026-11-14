import { useId } from 'react';
import PageShell from '../components/ui/PageShell';
import { niceAxis } from '../components/charts/ProfileBars';
import ChartTableDetails from '../components/charts/ChartTableDetails';
import TileMap, { type MapTile } from '../components/charts/TileMap';
import LegendItem from '../components/ui/LegendItem';
import { REGION_TILES } from '../data/regionTileGrid';
import CategorySpark, { type SparkColumn } from '../components/charts/CategorySpark';
import SplitBar, { type SplitBarSegment } from '../components/charts/SplitBar';
import { CHART_COUNT } from '../components/charts/useActivePart';
import ResearchMethod from '../components/research/ResearchMethod';
import ResearchHeader from '../components/research/ResearchHeader';
import type { DataTableColumn } from '../components/ui/DataTable';
import { FREE_CHILD_AGE_COUNTS, FREE_CHILD_AGE_LABEL, FREE_CHILD_AGENCIES_BY_COUNTRY, FREE_CHILD_OTHER_POLICIES, FREE_CHILD_REGIONS, freeChildAgeBars, freeChildFareStats, type FreeChildFareBar } from '../data/freeChildFares';

const TABLE_COLUMNS: DataTableColumn<FreeChildFareBar>[] = [
  { key: 'group', header: 'Group', cell: bar => bar.label, rowHeader: true, className: 'font-normal', width: 12 },
  { key: 'agencies', header: 'Agencies', cell: bar => bar.agencies, className: 'tabular-nums', width: 6 },
];

// "Not found" is drawn hatched: no current official rule, not a policy.
const HATCHED = 'repeating-linear-gradient(135deg, var(--text-muted) 0 3px, transparent 3px 6px)';

/** Every age from the youngest to the oldest cutoff, with the ages no agency uses at zero, so the axis reads as ages. */
const ageCounts = new Map(FREE_CHILD_AGE_COUNTS);
const ageCountOf = (age: number) => ageCounts.get(age) ?? 0;
const ages = FREE_CHILD_AGE_COUNTS.map(([age]) => age);
const SPLIT_GREYS = [100, 78, 60, 46, 34, 24];
const splitFill = (i: number, unknown: boolean) => (unknown ? HATCHED : `color-mix(in srgb, var(--text-muted) ${SPLIT_GREYS[i]}%, transparent)`);
const agencies = (n: number) => `${n} ${n === 1 ? 'agency' : 'agencies'}`;
const ageColumns: SparkColumn[] = Array.from({ length: Math.max(...ages) - Math.min(...ages) + 1 }, (_, i) => {
  const age = Math.min(...ages) + i;
  return { key: age, label: String(age), value: ageCountOf(age), fill: 'var(--text-muted)', sentence: `Up to ${age}: ${agencies(ageCountOf(age))}` };
});

// CIV-1176 (Ryan: the agency page's split bar here too): every agency once, by policy group, in the chart's order.
// Greys from the research charts, a step lighter each; "Not found" striped as in its bar.
const splitSegments: SplitBarSegment[] = [
  { key: 'age', label: FREE_CHILD_AGE_LABEL, value: freeChildFareStats.freeUpToAge },
  ...FREE_CHILD_OTHER_POLICIES.map(p => ({ key: p.policyType, label: p.label, value: p.agencies, unknown: p.unknown })),
].map((s, i) => ({
  key: s.key,
  value: s.value,
  fill: splitFill(i, 'unknown' in s && !!s.unknown),
  sentence: `${agencies(s.value)}: ${s.label}`,
  legend: <span><span className={CHART_COUNT}>{s.value}</span> {s.label}</span>,
}));
// Ryan's words (2026-10-30), with the numbers read from the data.
const SPLIT_LABEL = `How many agencies have each kind of free child fare policy, out of ${freeChildFareStats.agencies}.`;

// #1290 (Ryan): the age chart in the sparkline charts' shape, picked like the split bar. The other policies are in the split bar alone.
const chartTicks = niceAxis(0, Math.max(...ageColumns.map(c => c.value))).ticks;

// CIV-1282 (Ryan picked the tile map, in squares): each state's or province's most common free age, from the same ledger counts.
// A tie names no single age ("Mix"); a place with no age limit shows a dash; fewer than MIN_AGE_RULES agencies with an age
// limit draws the tile with a dashed outline, since its "most common" rests on one or two agencies.
const MIN_AGE_RULES = 3;
const AGE_BANDS: ReadonlyArray<{ upTo: number; label: string; mix: number }> = [
  { upTo: 5, label: 'Up to 5', mix: 28 }, { upTo: 9, label: '6–9', mix: 56 }, { upTo: 11, label: '10–11', mix: 70 },
  { upTo: 13, label: '12–13', mix: 85 }, { upTo: 18, label: '14–18', mix: 100 },
];
const bandFill = (mix: number) => `color-mix(in srgb, var(--text-muted) ${mix}%, transparent)`;
const regionRows = FREE_CHILD_REGIONS.map(([region, total, regionAges]) => {
  const withAge = regionAges.reduce((n, [, c]) => n + c, 0);
  const top = Math.max(0, ...regionAges.map(([, c]) => c));
  const leaders = regionAges.filter(([, c]) => c === top).map(([age]) => age);
  const age = withAge > 0 && leaders.length === 1 ? leaders[0] : null;
  return { region, total, withAge, age, tie: leaders.length > 1 ? leaders : null };
});
const regionTiles: MapTile[] = regionRows.map(r => {
  const { abbr, col, row } = REGION_TILES[r.region];
  const band = r.age != null ? AGE_BANDS.find(b => r.age! <= b.upTo)! : null;
  const what = r.age != null ? `most common free age ${r.age}` : r.tie ? `a tie between ages ${r.tie.join(', ')}` : 'no age limit found';
  return {
    key: r.region, abbr, col, row, count: r.total,
    value: r.age != null ? String(r.age) : r.tie ? 'Mix' : '–',
    fill: band ? bandFill(band.mix) : 'none', darkFill: !!band && band.mix >= 85, thin: r.withAge > 0 && r.withAge < MIN_AGE_RULES,
    sentence: `${r.region}: ${what}, ${agencies(r.total)}, ${r.withAge} with an age limit.`,
  };
});
const REGION_COLUMNS: DataTableColumn<(typeof regionRows)[number]>[] = [
  { key: 'region', header: 'State or province', cell: r => r.region, rowHeader: true, className: 'font-normal', width: 12 },
  { key: 'age', header: 'Most common free age', cell: r => (r.age != null ? r.age : r.tie ? `Tie: ${r.tie.join(', ')}` : 'None'), width: 8 },
  { key: 'withAge', header: 'With an age limit', cell: r => r.withAge, className: 'tabular-nums', width: 6 },
  { key: 'total', header: 'Agencies', cell: r => r.total, className: 'tabular-nums', width: 6 },
];
const MAP_TITLE = 'Most common free age, by state and province';

const peakAge = [...FREE_CHILD_AGE_COUNTS].sort((a, b) => b[1] - a[1])[0];
const AGE_CHART_ARIA = `How many agencies let children ride free up to each age, from ${Math.min(...ages)} to ${Math.max(...ages)}. Age ${peakAge[0]} is the most common, at ${peakAge[1]} agencies.`;
const keyFigures = [
  { label: `Free up to age ${peakAge[0]}`, value: peakAge[1] },
  { label: 'Free up to age 18', value: ageCounts.get(18) ?? 0 },
  { label: 'Free for everyone', value: FREE_CHILD_OTHER_POLICIES.find(p => p.policyType === 'all-fare-free')!.agencies },
];

export default function FreeChildFaresPage() {
  const tableId = useId();
  const mapTableId = useId();
  const method = (
    <ResearchMethod parts={{
      dateConducted: <>October 11, 2026.</>,
      sample: <>Canada and the United States only. All {freeChildFareStats.agencies} agencies Atlas covered on that date: {FREE_CHILD_AGENCIES_BY_COUNTRY['United States']} in the United States and {FREE_CHILD_AGENCIES_BY_COUNTRY.Canada} in Canada.</>,
      sources: <>Only an agency’s own fare page, or its city or county fare bylaw, counted.</>,
      whatCounted: <>Each bar uses the oldest age that rides free: "under 6 ride free" counts as 5. When two official pages disagreed, we used the narrower rule. "Fare-free" means the whole system is free for every rider. Free fares that apply only in some seasons, with a pass or for residents are counted under "Program only", not as a free child fare. Free fares up to 17 or 18 are usually youth programs.</>,
      notFound: <>We couldn’t find a current official rule for {freeChildFareStats.notFound} agencies. Some sites block automated visits, some fare pages have no child rule, and some describe children without an age, such as "preschoolers". These are drawn with stripes.</>,
      limitations: <>This is a snapshot of October 11, 2026, not a live list. Fares change, and seasonal programs and short free-fare periods will go out of date.</>,
    }} />
  );
  return (
    <PageShell stickyHeader method={method}>
      <article className="pb-16 pt-10 sm:pt-14">
        <ResearchHeader
          title="Free child fares"
          intro={<>
            {/* CIV-1281 (Ryan): the finding opens the page as an intro line, as the other research pages open, not a big heading. */}
            <p>Where kids ride free, age {peakAge[0]} is the most common cutoff.</p>
            <p>Most transit agencies let young children ride free. Where that free fare ends changes from one agency to the next.</p>
            <p>We read the official fare rules of {freeChildFareStats.agencies} transit agencies in Canada and the United States to find up to what age children ride free, and under what conditions.</p>
          </>}
        >
          <div className="text-left">
            <SplitBar segments={splitSegments} label={SPLIT_LABEL} />
          </div>
        </ResearchHeader>

        <div className="mx-auto mt-10 max-w-3xl space-y-10 sm:mt-12 sm:space-y-14">
          <section aria-labelledby="free-child-age-chart">
            <p className="text-base leading-8 text-[var(--text-muted)]">
              {freeChildFareStats.freeUpToAge} of {freeChildFareStats.agencies} agencies let children ride free up to a set age. Each bar counts the agencies whose free fare ends at that age.
            </p>
            <dl className="mt-8 grid grid-cols-3 gap-3">
              {keyFigures.map(figure => (
                <div key={figure.label} className="rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-panel)] p-4">
                  <dt className="text-xs font-bold leading-5 text-[var(--text-muted)]">{figure.label}</dt>
                  <dd className="mt-1 text-3xl font-black tabular-nums tracking-tight sm:text-4xl">{figure.value}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-8 rounded-[2rem] border border-[var(--border-primary)] bg-[var(--bg-panel)] p-5 sm:p-8">
              <h2 id="free-child-age-chart" className="text-xs font-black text-[var(--text-primary)]">Free up to a set age</h2>
              {/* keepEmpty: the ages run as a continuous scale, so an age no agency uses (15, 16) keeps its place and the gap shows. */}
              <CategorySpark columns={ageColumns} keepEmpty label={AGE_CHART_ARIA} ticks={chartTicks} defaultKey={peakAge[0]} details={tableId} />
              <ChartTableDetails id={tableId} caption="Free up to a set age" columns={TABLE_COLUMNS} rows={freeChildAgeBars} rowKey={bar => bar.label} />
            </div>
          </section>

          <section aria-labelledby="free-child-age-map">
            <div className="rounded-[2rem] border border-[var(--border-primary)] bg-[var(--bg-panel)] p-5 sm:p-8">
              <h2 id="free-child-age-map" className="text-xs font-black text-[var(--text-primary)]">{MAP_TITLE}</h2>
              <p className="mt-1 text-xs text-[var(--text-muted)]">Each square is one state or province: its most common free age, and its number of agencies.</p>
              <TileMap tiles={regionTiles} label={`${MAP_TITLE}, for ${regionTiles.length} states and provinces.`} details={mapTableId} />
              <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--text-primary)]">
                {AGE_BANDS.map(b => <li key={b.label}><LegendItem color={bandFill(b.mix)}>{b.label}</LegendItem></li>)}
                <li><LegendItem color="var(--bg-panel)" swatchClassName="ring-1 ring-[var(--border-primary)]">Mix: a tie · –: no age limit</LegendItem></li>
                <li><LegendItem color="transparent" swatchClassName="border border-dashed border-[var(--text-muted)]">Dashed: only 1 or {MIN_AGE_RULES - 1} agencies with an age limit</LegendItem></li>
              </ul>
              <ChartTableDetails id={mapTableId} caption={MAP_TITLE} columns={REGION_COLUMNS} rows={regionRows} rowKey={r => r.region} />
            </div>
          </section>
        </div>
      </article>
    </PageShell>
  );
}
