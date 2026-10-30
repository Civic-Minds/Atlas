import DocsPageLayout from '../components/ui/DocsPageLayout';
import { PageTitle } from '../components/ui/PageTitle';
import ChartTableDetails from '../components/charts/ChartTableDetails';
import type { DataTableColumn } from '../components/ui/DataTable';
import { FREE_CHILD_AGENCIES_BY_COUNTRY, freeChildAgeBars, freeChildFareStats, freeChildOtherBars, type FreeChildFareBar } from '../data/freeChildFares';

const TABLE_COLUMNS: DataTableColumn<FreeChildFareBar>[] = [
  { key: 'group', header: 'Group', cell: bar => bar.label, rowHeader: true, className: 'font-normal', width: 12 },
  { key: 'agencies', header: 'Agencies', cell: bar => bar.agencies, className: 'tabular-nums', width: 6 },
];

// "Not found yet" is drawn hatched: no current official rule, not a policy.
const HATCHED = 'repeating-linear-gradient(135deg, var(--text-muted) 0 3px, transparent 3px 6px)';

/** One chart: its title, bars on their own scale, and its own "Show as a table". */
function BarGroup({ title, bars, plain, separate }: { title: string; bars: FreeChildFareBar[]; plain?: boolean; separate?: boolean }) {
  const maxBar = Math.max(...bars.map(bar => bar.agencies));
  return (
    <div className={separate ? 'mt-8 border-t border-[var(--border-primary)] pt-6' : 'mt-8'}>
      <h3 className="text-xs font-black text-[var(--text-primary)]">{title}</h3>
      <ul className="mt-3 space-y-1.5">
        {bars.map(bar => (
          <li
            key={bar.label}
            title={`${bar.label}: ${bar.agencies} ${bar.agencies === 1 ? 'agency' : 'agencies'}`}
            className="grid cursor-default grid-cols-[7.5rem_1fr_2.25rem] items-center gap-2 rounded-lg py-0.5 text-sm hover:bg-[var(--bg-btn-hover)] sm:grid-cols-[9.5rem_1fr_2.5rem] sm:gap-3"
          >
            <span className={`${plain ? 'font-semibold' : 'font-black'} text-[var(--text-primary)]`}>{bar.label}</span>
            <div className="h-3 overflow-hidden rounded-full bg-[var(--bg-stat)]">
              <div
                className="h-full rounded-full"
                style={{ width: `${(bar.agencies / maxBar) * 100}%`, background: bar.unknown ? HATCHED : 'var(--text-muted)' }}
              />
            </div>
            <span className="text-right tabular-nums text-[var(--text-muted)]">{bar.agencies}</span>
          </li>
        ))}
      </ul>
      <ChartTableDetails caption={title} columns={TABLE_COLUMNS} rows={bars} rowKey={bar => bar.label} />
    </div>
  );
}

export default function FreeChildFaresPage() {
  return (
    <DocsPageLayout articleClassName="text-sm leading-relaxed text-[var(--text-dim)]">
      <header>
        <PageTitle className="text-[var(--text-primary)]">Free child fares</PageTitle>
        <div className="mt-4 max-w-2xl space-y-3 text-base leading-7 text-[var(--text-muted)]">
          <p>Most transit agencies let young children ride free. Where that free fare ends changes from one agency to the next.</p>
          <p>We read the official fare rules of {freeChildFareStats.agencies} transit agencies in Canada and the United States to find up to what age children ride free, and under what conditions.</p>
        </div>
      </header>
      <section aria-labelledby="free-child-fares-heading" className="rounded-[2rem] border border-[var(--border-primary)] bg-[var(--bg-panel)] p-5 text-[var(--text-primary)] sm:p-8">
        <div className="max-w-2xl">
          <h2 id="free-child-fares-heading" className="text-2xl sm:text-3xl font-black tracking-tight">Where kids ride free, age 5 is the most common cutoff.</h2>
          <p className="mt-4 text-sm leading-7 text-[var(--text-muted)]">
            {freeChildFareStats.freeUpToAge} of {freeChildFareStats.agencies} agencies let children ride free up to a set age. Each bar counts the agencies whose free fare ends at that age.
          </p>
        </div>
        <BarGroup title="Free up to a set age" bars={freeChildAgeBars} />
        <BarGroup title="Other policies" bars={freeChildOtherBars} plain separate />
        <p className="mt-6 text-xs leading-5 text-[var(--text-dim)]">
          Each agency appears once, taken from its own fare page or fare bylaw and checked on October 11, 2026. Free fares up to 17 or 18 are usually youth programs. We couldn't find a current official rule for {freeChildFareStats.notFound} agencies.
        </p>
      </section>
      <footer className="mt-10 border-t border-[var(--border-primary)] pt-8">
        <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-[var(--text-primary)]">How we did this</h2>
        <div className="mt-5 space-y-5 text-sm sm:text-base leading-7 sm:leading-8 text-[var(--text-muted)]">
          <p><strong className="text-[var(--text-primary)]">Date conducted.</strong> October 11, 2026.</p>
          <p><strong className="text-[var(--text-primary)]">Sample.</strong> Canada and the United States only: every agency Atlas had there on that date, {freeChildFareStats.agencies} in all, {FREE_CHILD_AGENCIES_BY_COUNTRY['United States']} in the United States and {FREE_CHILD_AGENCIES_BY_COUNTRY.Canada} in Canada.</p>
          <p><strong className="text-[var(--text-primary)]">Sources.</strong> Only an agency's own fare page, or its city or county fare bylaw, counted. Other agencies' pages, fare values in schedule data, search results and sites such as Wikipedia or Moovit did not.</p>
          <p><strong className="text-[var(--text-primary)]">What counted.</strong> Each bar uses the oldest age that rides free: "under 6 ride free" counts as 5. When two official pages disagreed, we used the narrower rule. "Free for everyone" means the whole system is free for every rider. Free fares that apply only in some seasons, with a pass or for residents are counted under "Only under a program", not as a free child fare.</p>
          <p><strong className="text-[var(--text-primary)]">Not found yet.</strong> We couldn't find a current official rule for {freeChildFareStats.notFound} agencies. Some sites block automated visits, some fare pages have no child rule, and some describe children without an age, such as "preschoolers". These are drawn with stripes.</p>
          <p><strong className="text-[var(--text-primary)]">Limitations.</strong> This is a snapshot of October 11, 2026, not a live list. Fares change, and seasonal programs and short free-fare periods will go out of date.</p>
        </div>
      </footer>
    </DocsPageLayout>
  );
}
