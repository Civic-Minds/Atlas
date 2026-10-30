import PageShell from '../components/ui/PageShell';
import ProfileBars, { type ProfilePoint } from '../components/charts/ProfileBars';
import ChartTableDetails from '../components/charts/ChartTableDetails';
import RankedBars from '../components/charts/RankedBars';
import SplitBar, { type SplitBarSegment } from '../components/charts/SplitBar';
import ResearchMethod from '../components/research/ResearchMethod';
import type { DataTableColumn } from '../components/ui/DataTable';
import { FREE_CHILD_AGE_COUNTS, FREE_CHILD_AGENCIES_BY_COUNTRY, FREE_CHILD_OTHER_POLICIES, freeChildAgeBars, freeChildFareStats, freeChildOtherBars, type FreeChildFareBar } from '../data/freeChildFares';

const TABLE_COLUMNS: DataTableColumn<FreeChildFareBar>[] = [
  { key: 'group', header: 'Group', cell: bar => bar.label, rowHeader: true, className: 'font-normal', width: 12 },
  { key: 'agencies', header: 'Agencies', cell: bar => bar.agencies, className: 'tabular-nums', width: 6 },
];

// "Not found yet" is drawn hatched: no current official rule, not a policy.
const HATCHED = 'repeating-linear-gradient(135deg, var(--text-muted) 0 3px, transparent 3px 6px)';

// CIV-1176 (proposed wording, held for Ryan's OK on _review/civ-1176): the age chart's axis, its screen-reader name and
// the key figures' names.
const AGE_AXIS_TITLE = 'Agencies, by the oldest age that rides free';
const AGE_CHART_ARIA = 'Agencies by the oldest age that rides free, from 1 to 18. Age 5 has the most.';

/** Every age from the youngest to the oldest cutoff, with the ages no agency uses at zero, so the axis reads as ages. */
const ageCounts = new Map(FREE_CHILD_AGE_COUNTS);
const ageCountOf = (age: number) => ageCounts.get(age) ?? 0;
const ages = FREE_CHILD_AGE_COUNTS.map(([age]) => age);
// The ages the axis names first: each column taller than both its neighbours (5, 12 and 18 today), and the two ends.
const namedAges = new Set(FREE_CHILD_AGE_COUNTS.filter(([age, n]) => n > (ageCountOf(age - 1)) && n > (ageCountOf(age + 1))).map(([age]) => age));
const agePoints: ProfilePoint[] = Array.from({ length: Math.max(...ages) - Math.min(...ages) + 1 }, (_, i) => {
  const age = Math.min(...ages) + i;
  const n = ageCounts.get(age) ?? 0;
  return { label: `Up to ${age}`, short: String(age), y: n, empty: n === 0, major: namedAges.has(age) || age === Math.min(...ages) || age === Math.max(...ages) };
});

// CIV-1176 (Ryan: the agency page's split bar here too): every agency once, by policy group, in the chart's order.
// Greys from the research charts, a step lighter each; "Not found yet" striped as in its bar.
const SPLIT_GREYS = [100, 78, 60, 46, 34, 24];
const splitSegments: SplitBarSegment[] = [
  { key: 'age', label: 'Free up to a set age', value: freeChildFareStats.freeUpToAge },
  ...FREE_CHILD_OTHER_POLICIES.map(p => ({ key: p.policyType, label: p.label, value: p.agencies, unknown: p.unknown })),
].map((s, i) => ({
  key: s.key,
  value: s.value,
  fill: 'unknown' in s && s.unknown ? HATCHED : `color-mix(in srgb, var(--text-muted) ${SPLIT_GREYS[i]}%, transparent)`,
  sentence: `${s.value} ${s.value === 1 ? 'agency' : 'agencies'}: ${s.label}`,
  legend: <span><span className="font-black">{s.value}</span> {s.label}</span>,
}));
const SPLIT_LABEL = 'Agencies by free child fare policy';

const peakAge = [...FREE_CHILD_AGE_COUNTS].sort((a, b) => b[1] - a[1])[0];
const keyFigures = [
  { label: `Free up to age ${peakAge[0]}`, value: peakAge[1] },
  { label: 'Free up to age 18', value: ageCounts.get(18) ?? 0 },
  { label: 'Free for everyone', value: FREE_CHILD_OTHER_POLICIES.find(p => p.policyType === 'all-fare-free')!.agencies },
];

export default function FreeChildFaresPage() {
  const method = (
    <ResearchMethod parts={{
      dateConducted: <>October 11, 2026.</>,
      sample: <>Canada and the United States only: every agency Atlas had there on that date, {freeChildFareStats.agencies} in all, {FREE_CHILD_AGENCIES_BY_COUNTRY['United States']} in the United States and {FREE_CHILD_AGENCIES_BY_COUNTRY.Canada} in Canada.</>,
      sources: <>Only an agency's own fare page, or its city or county fare bylaw, counted. Other agencies' pages, fare values in schedule data, search results and sites such as Wikipedia or Moovit did not.</>,
      whatCounted: <>Each bar uses the oldest age that rides free: "under 6 ride free" counts as 5. When two official pages disagreed, we used the narrower rule. "Free for everyone" means the whole system is free for every rider. Free fares that apply only in some seasons, with a pass or for residents are counted under "Only under a program", not as a free child fare.</>,
      notFound: <>We couldn't find a current official rule for {freeChildFareStats.notFound} agencies. Some sites block automated visits, some fare pages have no child rule, and some describe children without an age, such as "preschoolers". These are drawn with stripes.</>,
      limitations: <>This is a snapshot of October 11, 2026, not a live list. Fares change, and seasonal programs and short free-fare periods will go out of date.</>,
    }} />
  );
  const ageScale = { min: 0, max: freeChildFareStats.maxBar };
  return (
    <PageShell stickyHeader method={method}>
      <article className="pb-16 pt-10 sm:pt-14">
        <header className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-black text-[var(--accent)]">Atlas research</p>
          <h1 className="mt-5 text-4xl sm:text-6xl font-black tracking-[-0.045em] leading-[0.98]">Free child fares</h1>
          <div className="mt-6 space-y-4 text-left text-base leading-8 text-[var(--text-muted)] sm:text-lg">
            <p>Most transit agencies let young children ride free. Where that free fare ends changes from one agency to the next.</p>
            <p>We read the official fare rules of {freeChildFareStats.agencies} transit agencies in Canada and the United States to find up to what age children ride free, and under what conditions.</p>
          </div>
          <div className="text-left">
            <SplitBar segments={splitSegments} label={SPLIT_LABEL} />
          </div>
        </header>

        <div className="mx-auto mt-14 max-w-3xl space-y-10 sm:mt-20 sm:space-y-14">
          <section aria-labelledby="free-child-fares-heading">
            <h2 id="free-child-fares-heading" className="text-3xl sm:text-4xl font-black tracking-tight">Where kids ride free, age 5 is the most common cutoff.</h2>
            <p className="mt-5 text-base leading-8 text-[var(--text-muted)]">
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
              <h3 className="text-xs font-black text-[var(--text-primary)]">Free up to a set age</h3>
              <ProfileBars
                points={agePoints}
                ariaLabel={AGE_CHART_ARIA}
                formatY={n => `${n}`}
                unit="agencies"
                minN={0}
                fadedNote={false}
                whiskers={false}
                peakLabel
                axisTitle={AGE_AXIS_TITLE}
                scale={ageScale}
                maxLabels={18}
                labelSpacing={24}
                valueHeader="Agencies"
                rowHeader="Group"
              />
              <ChartTableDetails caption="Free up to a set age" columns={TABLE_COLUMNS} rows={freeChildAgeBars} rowKey={bar => bar.label} />
            </div>
          </section>

          <section aria-labelledby="other-policies-heading">
            <div className="rounded-[2rem] border border-[var(--border-primary)] bg-[var(--bg-panel)] p-5 sm:p-8">
              <h3 id="other-policies-heading" className="text-xs font-black text-[var(--text-primary)]">Other policies</h3>
              <RankedBars
                as="list"
                bars={freeChildOtherBars.map(bar => ({ key: bar.label, label: bar.label, value: bar.agencies, fill: bar.unknown ? HATCHED : 'var(--text-muted)' }))}
                max={freeChildFareStats.maxBar}
                listClassName="mt-3 space-y-1.5"
                rowClassName="grid cursor-default grid-cols-[7.5rem_1fr_2.25rem] items-center gap-2 rounded-lg py-0.5 text-sm hover:bg-[var(--bg-btn-hover)] sm:grid-cols-[9.5rem_1fr_2.5rem] sm:gap-3"
                labelClassName="font-semibold text-[var(--text-primary)]"
                title={bar => `${bar.label}: ${bar.value} ${bar.value === 1 ? 'agency' : 'agencies'}`}
              />
              <ChartTableDetails caption="Other policies" columns={TABLE_COLUMNS} rows={freeChildOtherBars} rowKey={bar => bar.label} />
            </div>
            <p className="mt-6 text-xs leading-5 text-[var(--text-dim)]">
              Each agency appears once, taken from its own fare page or fare bylaw and checked on October 11, 2026. Free fares up to 17 or 18 are usually youth programs. We couldn't find a current official rule for {freeChildFareStats.notFound} agencies.
            </p>
          </section>
        </div>
      </article>
    </PageShell>
  );
}
